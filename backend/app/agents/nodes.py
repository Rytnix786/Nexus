from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any, TypedDict

import httpx

from app.agents.tools import bm25_search, rerank, web_search
from app.core.cache import get_cached_response, save_response_to_cache
from app.core.logging import get_logger
from app.core.settings import settings
from app.core.state import AgentState
from app.core.tracing import safe_trace_span


class TraceEvent(TypedDict):
    seq: int
    ts: str
    event_type: str
    node: str
    message: str
    data: dict[str, Any]


logger = get_logger(__name__)


# ─── Writer output section patterns ───────────────────────────────────────
DRAFT_REQUIRED_SECTIONS_PARTIAL = [
    r"\bsummary\b",
    r"\bkey findings\b",
    r"\brecommendations\b",
]

DRAFT_REQUIRED_SECTIONS_COMPLETE = [
    r"\bsummary\b",
    r"\bkey findings\b",
    r"\brecommendations\b",
    r"\brisks and mitigations\b",
    r"\bassumptions and unknowns\b",
    r"\bnext-step execution plan\b",
]


def _target_num_predict(state: AgentState, node: str) -> int:
    base = max(settings.token_limit_min, int(settings.ollama_num_predict))
    node_overrides = {
        "planner": min(base, settings.token_limit_planner),
        "researcher": max(base, settings.token_limit_researcher),
        "analyst": max(base, settings.token_limit_analyst),
        "writer": max(base, settings.token_limit_writer),
        "critic": max(base, settings.token_limit_critic),
    }
    requested = node_overrides.get(node, base)
    remaining_budget = int(state.get("token_budget_remaining", requested) or requested)
    budget_cap = max(settings.token_limit_min, min(remaining_budget, settings.token_limit_max))
    return max(settings.token_limit_min, min(requested, budget_cap))


def _writer_output_needs_completion(draft: str) -> bool:
    text = draft.lower()
    present = sum(1 for pattern in DRAFT_REQUIRED_SECTIONS_PARTIAL if re.search(pattern, text))
    return present < len(DRAFT_REQUIRED_SECTIONS_PARTIAL) or len(draft.strip()) < settings.writer_min_draft_length


def _draft_is_complete(draft: str) -> bool:
    text = draft.lower()
    return all(re.search(pattern, text) for pattern in DRAFT_REQUIRED_SECTIONS_COMPLETE) and len(draft.strip()) >= settings.writer_min_completion_length


def _uploaded_context_block(state: AgentState, max_chars: int = 2400) -> str:
    context = str(state.get("uploaded_context", "") or "").strip()
    if not context:
        return ""
    return f"\n\nUploaded source context:\n{_trim_context(context, max_chars)}"


def _web_search_context_block(search_result: dict[str, Any], max_chars: int = 1800) -> str:
    results = list(search_result.get("results", []))
    if not results:
        return ""

    source_label = "live Tavily search" if search_result.get("web_search_used") else "offline fallback search"
    lines = [
        f"Web search findings ({source_label}):",
        f"Query: {search_result.get('query', '')}",
    ]
    error_text = str(search_result.get("error", "")).strip()
    if error_text:
        lines.append(f"Search error: {_trim_context(error_text, 240)}")

    for index, item in enumerate(results, start=1):
        title = str(item.get("title", "")).strip() or "Untitled result"
        url = str(item.get("url", "")).strip()
        content = _trim_context(str(item.get("content") or item.get("snippet") or ""), max_chars)
        entry = f"{index}. {title}"
        if url:
            entry = f"{entry} ({url})"
        if content:
            entry = f"{entry} - {content}"
        lines.append(entry)

    return f"\n\n{chr(10).join(lines)}"


def _trim_context(text: str, max_chars: int = 800) -> str:
    clean = text.strip()
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars].rstrip() + "..."


def _validate_trace(trace_raw: Any) -> list[TraceEvent]:
    """Validate and normalize trace events from state.
    
    Returns a list of valid TraceEvent objects, silently filtering out
    any invalid entries to prevent corruption from propagating.
    """
    if not isinstance(trace_raw, list):
        logger.warning("Invalid trace format: expected list", extra={"type": type(trace_raw).__name__})
        return []
    
    validated: list[TraceEvent] = []
    for item in trace_raw:
        if not isinstance(item, dict):
            logger.warning("Invalid trace item: expected dict", extra={"type": type(item).__name__})
            continue
        
        # Validate required fields
        required_keys = {"seq", "ts", "event_type", "node", "message", "data"}
        if not all(k in item for k in required_keys):
            missing = required_keys - set(item.keys())
            logger.warning("Invalid trace item: missing keys", extra={"missing": list(missing)})
            continue
        
        try:
            validated_event: TraceEvent = {
                "seq": int(item["seq"]),
                "ts": str(item["ts"]),
                "event_type": str(item["event_type"]),
                "node": str(item["node"]),
                "message": str(item["message"]),
                "data": dict(item.get("data", {})),
            }
            validated.append(validated_event)
        except (ValueError, TypeError) as e:
            logger.warning("Failed to validate trace item", extra={"error": str(e)})
            continue
    
    return validated


def _append_trace(state: AgentState, node: str, event_type: str, message: str, data: dict[str, Any]) -> list[TraceEvent]:
    trace = _validate_trace(state.get("trace", []))
    event: TraceEvent = {
        "seq": len(trace) + 1,
        "ts": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "node": node,
        "message": message,
        "data": data,
    }
    return [*trace, event]


def _terminal_output(state: AgentState, terminal_status: str) -> str:
    header_lines = [
        f"Run ID: {state['run_id']}",
        f"Objective: {state['objective']}",
        f"Status: {terminal_status}",
        f"Iterations: {state['iteration_count']}",
        f"Token Budget Remaining: {state['token_budget_remaining']}",
        f"Human Decision: {state.get('human_decision', '') or 'n/a'}",
    ]
    output = "\n".join(header_lines)
    if state.get("draft"):
        output = f"{output}\n\n{state['draft']}"
    return output


def _guard_state(state: AgentState, node: str) -> dict[str, Any] | None:
    now_epoch = time.time()
    if now_epoch > state["run_deadline_epoch"]:
        terminal_status = "timeout"
        return {
            "status": terminal_status,
            "current_node": "finalize",
            "final_output": _terminal_output(state, terminal_status),
            "updated_at": datetime.now(timezone.utc),
            "trace": _append_trace(
                state,
                node,
                "node_guard",
                "Run deadline exceeded",
                {"reason": "timeout", "run_deadline_epoch": state["run_deadline_epoch"]},
            ),
        }

    # Skip budget check in developer mode (developers shouldn't hit budget limits during dev)
    if not settings.developer_mode and state["token_budget_remaining"] <= 0:
        terminal_status = "budget_exhausted"
        return {
            "status": terminal_status,
            "current_node": "finalize",
            "final_output": _terminal_output(state, terminal_status),
            "updated_at": datetime.now(timezone.utc),
            "trace": _append_trace(
                state,
                node,
                "node_guard",
                "Token budget exhausted",
                {"reason": "budget_exhausted", "token_budget_remaining": state["token_budget_remaining"]},
            ),
        }

    return None


def _httpx_error_result(state: AgentState, node: str, exc: Exception) -> dict[str, Any]:
    logger.error(
        "Ollama request failed",
        extra={"node": node, "run_id": state.get("run_id", ""), "error": str(exc)},
    )
    return {
        "status": "failed",
        "current_node": node,
        "updated_at": datetime.now(timezone.utc),
        "trace": _append_trace(
            state,
            node,
            "node_error",
            "Ollama request failed",
            {"error": str(exc), "model": settings.ollama_model},
        ),
    }


def _ollama_generate(state: AgentState, node: str, prompt: str) -> tuple[str, int, int, dict[str, Any]] | dict[str, Any]:
    with safe_trace_span(
        "node.ollama_generate",
        {
            "run_id": str(state.get("run_id", "")),
            "node": node,
            "prompt_length": len(prompt),
        },
    ):
        try:
            base_url = settings.ollama_base_url.rstrip("/")
            response_url = f"{base_url}/api/generate"
            payload = {
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "keep_alive": settings.ollama_keep_alive,
                "options": {
                    "num_predict": _target_num_predict(state, node),
                },
            }
            with httpx.Client() as client:
                response = client.post(
                    response_url,
                    json=payload,
                    timeout=max(10.0, float(settings.ollama_timeout_seconds)),
                )
                response.raise_for_status()
                body = response.json()
        except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
            return _httpx_error_result(state, node, exc)

    if isinstance(body, dict):
        response_text = str(body.get("response", "")).strip()
    else:
        response_text = str(body).strip()

    if not response_text:
        response_text = response.text.strip()

    prompt_tokens = int(body.get("prompt_eval_count", 0)) if isinstance(body, dict) else 0
    completion_tokens = int(body.get("eval_count", 0)) if isinstance(body, dict) else 0
    exact_total = prompt_tokens + completion_tokens
    estimated_token_cost = max(1, len(response_text) // 4)
    is_exact = exact_total > 0
    charged_tokens = min(state["token_budget_remaining"], exact_total if is_exact else estimated_token_cost)
    remaining_budget = max(0, state["token_budget_remaining"] - charged_tokens)
    usage = {
        "prompt_tokens": prompt_tokens if is_exact else 0,
        "completion_tokens": completion_tokens if is_exact else charged_tokens,
        "total_tokens": charged_tokens,
        "metering_mode": "provider_exact" if is_exact else "estimated",
    }
    return response_text, charged_tokens, remaining_budget, usage


def _success_response(
    state: AgentState,
    node: str,
    event_type: str,
    message: str,
    data: dict[str, Any],
    **updates: Any,
) -> dict[str, Any]:
    return {
        **updates,
        "status": updates.get("status", "running"),
        "current_node": updates.get("current_node", state["current_node"]),
        "updated_at": datetime.now(timezone.utc),
        "trace": _append_trace(state, node, event_type, message, data),
    }


def router_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "router", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "router")
    if guard is not None:
        logger.info("Node exit", extra={"node": "router", "tokens_used": 0, "status": guard["status"]})
        return guard

    next_node = state.get("current_node") or "planner"
    result = _success_response(
        state,
        "router",
        "router_selected",
        "Router selected next node",
        {"next_node": next_node},
        current_node=next_node,
    )
    logger.info("Node exit", extra={"node": "router", "tokens_used": 0, "status": result["status"]})
    return result


def planner_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "planner", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "planner")
    if guard is not None:
        logger.info("Node exit", extra={"node": "planner", "tokens_used": 0, "status": guard["status"]})
        return guard

    # Build context for caching
    uploaded_context = str(state.get("uploaded_context", "") or "").strip()
    cache_context = uploaded_context[:200] if uploaded_context else ""
    
    # Check cache
    cached_plan = get_cached_response(state["objective"], cache_context)
    if cached_plan:
        compact_plan = _trim_context(cached_plan)
        logger.info("Using cached plan response", extra={"run_id": state.get("run_id", ""), "plan_length": len(compact_plan)})
        result = _success_response(
            state,
            "planner",
            "plan_created",
            "Research plan created (cached)",
            {
                "tokens_used": 0,
                "objective": state["objective"],
                "plan_length": len(compact_plan),
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "metering_mode": "cached",
                "cache_hit": True,
            },
            plan=compact_plan,
            token_budget_remaining=state["token_budget_remaining"],
            current_node="researcher",
        )
        logger.info("Node exit", extra={"node": "planner", "tokens_used": 0, "status": result["status"], "cache_hit": True})
        return result

    prompt = (
        "You are an expert research planner. Break the objective into 3-5 concrete research steps. "
        "Return only the step list as a concise plan.\n\n"
        f"Objective: {state['objective']}"
        f"{_uploaded_context_block(state, 1400)}"
    )
    llm_result = _ollama_generate(state, "planner", prompt)
    if isinstance(llm_result, dict):
        logger.info("Node exit", extra={"node": "planner", "tokens_used": 0, "status": llm_result["status"]})
        return llm_result

    plan, tokens_used, remaining_budget, usage = llm_result
    compact_plan = _trim_context(plan)
    
    # Save to cache
    save_response_to_cache(state["objective"], cache_context, plan)
    
    result = _success_response(
        state,
        "planner",
        "plan_created",
        "Research plan created",
        {
            "tokens_used": tokens_used,
            "objective": state["objective"],
            "plan_length": len(compact_plan),
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
            "metering_mode": usage["metering_mode"],
            "cache_hit": False,
        },
        plan=compact_plan,
        token_budget_remaining=remaining_budget,
        current_node="researcher",
    )
    logger.info("Node exit", extra={"node": "planner", "tokens_used": tokens_used, "status": result["status"]})
    return result


def researcher_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "researcher", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "researcher")
    if guard is not None:
        logger.info("Node exit", extra={"node": "researcher", "tokens_used": 0, "status": guard["status"]})
        return guard

    search_query = str(state["objective"]).strip()
    if not search_query:
        logger.warning("Empty search query", extra={"run_id": state.get("run_id", "")})
        search_result = {"query": "", "web_search_used": False, "source": "placeholder", "results": []}
    else:
        search_result = web_search(search_query)

    tavily_results = list(search_result.get("results", []))
    retrieved_context: list[dict[str, Any]] = []

    if tavily_results:
        tavily_docs = [
            f"{str(item.get('title', '')).strip()} {str(item.get('content', '')).strip()}".strip()
            for item in tavily_results
        ]
        bm25_results = bm25_search(search_query, tavily_docs, k=5)

        rrf_scores: dict[str, float] = {}
        rrf_k = 60

        for tavily_rank, item in enumerate(tavily_results):
            doc_key = f"{str(item.get('title', '')).strip()} {str(item.get('content', '')).strip()}".strip()
            rrf_scores[doc_key] = rrf_scores.get(doc_key, 0.0) + 1.0 / (rrf_k + tavily_rank)

        for bm25_rank, bm25_item in enumerate(bm25_results):
            doc_key = str(bm25_item["text"]).strip()
            rrf_scores[doc_key] = rrf_scores.get(doc_key, 0.0) + 1.0 / (rrf_k + bm25_rank)

        rrf_results = [
            {"text": doc_text, "rrf_score": score}
            for doc_text, score in sorted(rrf_scores.items(), key=lambda item: item[1], reverse=True)[:5]
        ]
        retrieved_context = rerank(search_query, rrf_results)

    search_context = _web_search_context_block(search_result)

    prompt = (
        "You are a research agent. Use the plan and web search findings to research each step and return bullet-point findings. "
        "Focus on concrete observations and evidence. Prefer sourced facts from the search results when available.\n\n"
        f"Objective: {state['objective']}\n\n"
        f"Plan:\n{_trim_context(state['plan'])}"
        f"{search_context}"
        f"{_uploaded_context_block(state, 2800)}"
    )

    llm_result = _ollama_generate(state, "researcher", prompt)
    if isinstance(llm_result, dict):
        logger.info("Node exit", extra={"node": "researcher", "tokens_used": 0, "status": llm_result["status"]})
        return llm_result

    findings, tokens_used, remaining_budget, usage = llm_result
    iteration_count = state["iteration_count"] + 1
    next_node = "analyst" if iteration_count >= state["max_iterations"] else "researcher"

    result = _success_response(
        state,
        "researcher",
        "research_completed",
        "Research pass completed",
        {
            "tokens_used": tokens_used,
            "findings_length": len(findings),
            "iteration_count": iteration_count,
            "next_node": next_node,
            "search_query": search_query,
            "results_found": len(tavily_results),
            "retrieved_context": retrieved_context,
            "web_search_used": bool(search_result.get("web_search_used")),
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
            "metering_mode": usage["metering_mode"],
        },
        research_notes=[*state["research_notes"], findings],
        iteration_count=iteration_count,
        token_budget_remaining=remaining_budget,
        current_node=next_node,
        retrieved_context=retrieved_context,
    )
    logger.info("Node exit", extra={"node": "researcher", "tokens_used": tokens_used, "status": result["status"]})
    return result


def analyst_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "analyst", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "analyst")
    if guard is not None:
        logger.info("Node exit", extra={"node": "analyst", "tokens_used": 0, "status": guard["status"]})
        return guard

    # Prefer retrieved evidence when available; fallback to generated notes.
    retrieved_context = state.get("retrieved_context", [])
    retrieved_texts = [
        str(doc.get("text", "")).strip()
        for doc in retrieved_context
        if isinstance(doc, dict) and str(doc.get("text", "")).strip()
    ]
    relevant_sources = 0
    if retrieved_texts:
        num_sources = len(retrieved_texts)
        total_text_length = sum(len(text) for text in retrieved_texts)

        cross_scores = [
            doc.get("cross_encoder_score")
            for doc in retrieved_context
            if isinstance(doc, dict) and str(doc.get("text", "")).strip()
        ]
        numeric_scores = [
            float(score)
            for score in cross_scores
            if isinstance(score, (int, float))
        ]
        if numeric_scores:
            relevant_sources = sum(1 for score in numeric_scores if score >= 0.0)
            context_source_count = relevant_sources
        else:
            context_source_count = num_sources
    else:
        research_notes = state.get("research_notes", [])
        num_sources = len(research_notes)
        total_text = "".join(str(note) for note in research_notes)
        total_text_length = len(total_text)
        context_source_count = num_sources

    insufficient_context = context_source_count < 2 or total_text_length < 200

    # Build context for caching
    cache_context = "".join(str(note)[:100] for note in state.get("research_notes", []))[:300]
    
    # Check cache (only if context is sufficient)
    cached_analysis = None
    if not insufficient_context:
        cached_analysis = get_cached_response(state["objective"], cache_context)
    
    if cached_analysis:
        analysis = cached_analysis
        tokens_used = 0
        remaining_budget = state["token_budget_remaining"]
        cache_hit = True
        logger.info("Using cached analysis response", extra={"run_id": state.get("run_id", ""), "analysis_length": len(analysis)})
    else:
        prompt = (
            "You are an analyst. Synthesize the research notes into key insights, themes, and any uncertainties. "
            "Return a concise synthesis.\n\n"
            f"Objective: {state['objective']}\n\n"
            f"Research notes:\n{_trim_context(chr(10).join(state['research_notes']), 1200)}"
            f"{_uploaded_context_block(state, 2400)}"
        )
        llm_result = _ollama_generate(state, "analyst", prompt)
        if isinstance(llm_result, dict):
            logger.info("Node exit", extra={"node": "analyst", "tokens_used": 0, "status": llm_result["status"]})
            return llm_result

        analysis, tokens_used, remaining_budget, usage = llm_result
        cache_hit = False
        
        # Save to cache (only if context is sufficient)
        if not insufficient_context:
            save_response_to_cache(state["objective"], cache_context, analysis)
    
    next_node = "refusal" if insufficient_context else "writer"
    
    # Use cached usage stats or actual ones
    if not cache_hit:
        usage = {
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
            "metering_mode": usage["metering_mode"],
        }
    else:
        usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "metering_mode": "cached",
        }
    
    result = _success_response(
        state,
        "analyst",
        "analysis_done",
        "Analysis completed",
        {
            "tokens_used": tokens_used,
            "analysis_length": len(analysis),
            "num_sources": num_sources,
            "context_source_count": context_source_count,
            "relevant_sources": relevant_sources,
            "total_text_length": total_text_length,
            "insufficient_context": insufficient_context,
            "next_node": next_node,
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
            "metering_mode": usage["metering_mode"],
            "cache_hit": cache_hit,
        },
        analysis=analysis,
        token_budget_remaining=remaining_budget,
        insufficient_context=insufficient_context,
        current_node=next_node,
    )
    logger.info("Node exit", extra={"node": "analyst", "tokens_used": tokens_used, "status": result["status"], "cache_hit": cache_hit})
    return result


def refusal_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "refusal", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "refusal")
    if guard is not None:
        logger.info("Node exit", extra={"node": "refusal", "tokens_used": 0, "status": guard["status"]})
        return guard

    refusal_message = "INSUFFICIENT_CONTEXT: The available sources did not contain enough information to produce a reliable report."
    
    result = _success_response(
        state,
        "refusal",
        "insufficient_context",
        "Refusing to generate report due to insufficient context",
        {
            "tokens_used": 0,
            "reason": "insufficient_context",
            "num_sources": len(state.get("research_notes", [])),
            "total_text_length": len("".join(str(note) for note in state.get("research_notes", []))),
        },
        draft=refusal_message,
        final_output=refusal_message,
        status="rejected",
        current_node="finalize",
    )
    logger.info("Node exit", extra={"node": "refusal", "tokens_used": 0, "status": result["status"]})
    return result


def writer_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "writer", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "writer")
    if guard is not None:
        logger.info("Node exit", extra={"node": "writer", "tokens_used": 0, "status": guard["status"]})
        return guard

    # Build context for caching
    cache_context = _trim_context(state.get("analysis", ""), 300)
    
    # Check cache
    cached_draft = get_cached_response(state["objective"], cache_context)
    if cached_draft:
        draft = cached_draft
        tokens_used = 0
        remaining_budget = state["token_budget_remaining"]
        cache_hit = True
        completed_sections = False  # Cached response, so no continuation was needed
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "metering_mode": "cached"}
        logger.info("Using cached writer response", extra={"run_id": state.get("run_id", ""), "draft_length": len(draft)})
    else:
        prompt = (
            "You are a senior report writer. Using the plan and analysis, write a complete, professional report in markdown. "
            "Use these exact headings in order: Summary, Key Findings, Recommendations, Risks and Mitigations, "
            "Assumptions and Unknowns, Next-Step Execution Plan. "
            "Under Key Findings include at least 6 evidence-based bullet points. "
            "Under Recommendations include at least 5 specific actionable items with rationale. "
            "Avoid generic filler; be concrete, thorough, and precise.\n\n"
            f"Objective: {state['objective']}\n\n"
            f"Plan:\n{_trim_context(state['plan'])}\n\n"
            f"Analysis:\n{_trim_context(state['analysis'], 1200)}"
            f"{_uploaded_context_block(state, 2800)}"
        )
        llm_result = _ollama_generate(state, "writer", prompt)
        if isinstance(llm_result, dict):
            logger.info("Node exit", extra={"node": "writer", "tokens_used": 0, "status": llm_result["status"]})
            return llm_result

        draft, tokens_used, remaining_budget, usage = llm_result
        cache_hit = False
        
        completed_sections = False
        if _writer_output_needs_completion(draft) and remaining_budget > 0:
            continuation_prompt = (
                "Continue and complete the same report. Return ONLY the missing sections with full content so the final report "
                "includes: Summary, Key Findings, Recommendations, Risks and Mitigations, Assumptions and Unknowns, "
                "Next-Step Execution Plan. Do not repeat already-complete sections.\n\n"
                f"Current draft:\n{_trim_context(draft, 2600)}"
            )
            continuation_result = _ollama_generate(
                {
                    **state,
                    "token_budget_remaining": remaining_budget,
                },
                "writer",
                continuation_prompt,
            )
            if not isinstance(continuation_result, dict):
                continuation_text, more_tokens, remaining_budget, _more_usage = continuation_result
                tokens_used += more_tokens
                continuation_clean = continuation_text.strip()
                existing_clean = draft.strip()
                if continuation_clean and continuation_clean.lower() != existing_clean.lower():
                    draft = f"{draft.rstrip()}\n\n{continuation_clean}"
                    completed_sections = True
        
        # Save to cache
        save_response_to_cache(state["objective"], cache_context, draft)

    next_node = "human_approval" if state["require_human_approval"] else "critic"
    result = _success_response(
        state,
        "writer",
        "draft_written",
        "Draft report written",
        {
            "tokens_used": tokens_used,
            "draft_length": len(draft),
            "next_node": next_node,
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
            "metering_mode": usage["metering_mode"],
            "completed_sections": completed_sections,
            "cache_hit": cache_hit,
        },
        draft=draft,
        token_budget_remaining=remaining_budget,
        current_node=next_node,
    )
    logger.info("Node exit", extra={"node": "writer", "tokens_used": tokens_used, "status": result["status"], "cache_hit": cache_hit})
    return result


def human_approval_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "human_approval", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "human_approval")
    if guard is not None:
        logger.info("Node exit", extra={"node": "human_approval", "tokens_used": 0, "status": guard["status"]})
        return guard

    decision = state.get("human_decision", "")
    if not decision:
        result = {
            "status": "awaiting_human",
            "current_node": "human_approval",
            "updated_at": datetime.now(timezone.utc),
            "trace": _append_trace(
                state,
                "human_approval",
                "human_checkpoint",
                "Awaiting human decision",
                {"tokens_used": 0, "reviewer": state.get("human_reviewer", "")},
            ),
        }
        logger.info("Node exit", extra={"node": "human_approval", "tokens_used": 0, "status": result["status"]})
        return result

    if decision == "reject":
        result = {
            "status": "rejected",
            "current_node": "finalize",
            "updated_at": datetime.now(timezone.utc),
            "trace": _append_trace(
                state,
                "human_approval",
                "human_checkpoint",
                "Human reviewer rejected the draft",
                {
                    "tokens_used": 0,
                    "reviewer": state.get("human_reviewer", ""),
                    "notes": state.get("human_notes", ""),
                },
            ),
        }
        logger.info("Node exit", extra={"node": "human_approval", "tokens_used": 0, "status": result["status"]})
        return result

    result = {
        "status": "running",
        "current_node": "critic",
        "updated_at": datetime.now(timezone.utc),
        "trace": _append_trace(
            state,
            "human_approval",
            "human_checkpoint",
            "Human reviewer approved the draft",
            {
                "tokens_used": 0,
                "reviewer": state.get("human_reviewer", ""),
                "notes": state.get("human_notes", ""),
            },
        ),
    }
    logger.info("Node exit", extra={"node": "human_approval", "tokens_used": 0, "status": result["status"]})
    return result


def critic_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "critic", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "critic")
    if guard is not None:
        logger.info("Node exit", extra={"node": "critic", "tokens_used": 0, "status": guard["status"]})
        return guard

    # Build context for caching
    cache_context = _trim_context(state.get("draft", ""), 400)
    
    # Check cache
    cached_critique = get_cached_response(state["objective"], cache_context)
    if cached_critique:
        critique = cached_critique
        tokens_used = 0
        remaining_budget = state["token_budget_remaining"]
        cache_hit = True
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "metering_mode": "cached"}
        logger.info("Using cached critic response", extra={"run_id": state.get("run_id", ""), "critique_length": len(critique)})
    else:
        prompt = (
            "You are a critical reviewer. Review the draft for accuracy, completeness, and clarity. "
            "Return either 'APPROVED: ...' or 'REVISION NEEDED: ...' with a brief explanation.\n\n"
            f"Objective: {state['objective']}\n\n"
            f"Plan:\n{state['plan']}\n\n"
            f"Analysis:\n{state['analysis']}\n\n"
            f"Draft:\n{state['draft']}"
        )
        llm_result = _ollama_generate(state, "critic", prompt)
        if isinstance(llm_result, dict):
            logger.info("Node exit", extra={"node": "critic", "tokens_used": 0, "status": llm_result["status"]})
            return llm_result

        critique, tokens_used, remaining_budget, usage = llm_result
        cache_hit = False
        
        # Save to cache
        save_response_to_cache(state["objective"], cache_context, critique)
    
    approved = critique.startswith("APPROVED")
    complete_draft = _draft_is_complete(str(state.get("draft", "") or ""))
    if settings.enforce_report_completeness and approved and not complete_draft and state["iteration_count"] < state["max_iterations"]:
        approved = False
        critique = (
            "REVISION NEEDED: Draft is incomplete. Ensure all required report sections are fully present: "
            "Summary, Key Findings, Recommendations, Risks and Mitigations, Assumptions and Unknowns, Next-Step Execution Plan."
        )
    if approved or state["iteration_count"] >= state["max_iterations"]:
        next_node = "finalize"
        next_iteration = state["iteration_count"]
    else:
        next_node = "writer"
        next_iteration = state["iteration_count"] + 1

    result = _success_response(
        state,
        "critic",
        "critique_done",
        "Draft critique completed",
        {
            "tokens_used": tokens_used,
            "critique_preview": critique[:120],
            "approved": approved,
            "complete_draft": complete_draft,
            "next_node": next_node,
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
            "metering_mode": usage["metering_mode"],
            "cache_hit": cache_hit,
        },
        critique=critique,
        iteration_count=next_iteration,
        token_budget_remaining=remaining_budget,
        current_node=next_node,
    )
    logger.info("Node exit", extra={"node": "critic", "tokens_used": tokens_used, "status": result["status"], "cache_hit": cache_hit})
    return result


def finalize_node(state: AgentState) -> dict[str, Any]:
    logger.debug("Node entry", extra={"node": "finalize", "run_id": state.get("run_id", "")})
    guard = _guard_state(state, "finalize")
    if guard is not None:
        logger.info("Node exit", extra={"node": "finalize", "tokens_used": 0, "status": guard["status"]})
        return guard

    status = state["status"] if state["status"] == "rejected" else "completed"
    if settings.enforce_report_completeness and status == "completed" and not _draft_is_complete(str(state.get("draft", "") or "")):
        status = "failed"
    header_lines = [
        f"Run ID: {state['run_id']}",
        f"Objective: {state['objective']}",
        f"Status: {status}",
        f"Iterations: {state['iteration_count']}",
        f"Token Budget Remaining: {state['token_budget_remaining']}",
        f"Human Decision: {state.get('human_decision', '') or 'n/a'}",
    ]
    output = "\n".join(header_lines)
    if state["draft"]:
        output = f"{output}\n\n{state['draft']}"

    result = {
        "status": status,
        "current_node": "finalize",
        "final_output": output,
        "updated_at": datetime.now(timezone.utc),
        "trace": _append_trace(
            state,
            "finalize",
            "finalized",
            "Run finalized",
            {"tokens_used": 0, "status": status, "output_length": len(output)},
        ),
    }
    logger.info("Node exit", extra={"node": "finalize", "tokens_used": 0, "status": result["status"]})
    return result
