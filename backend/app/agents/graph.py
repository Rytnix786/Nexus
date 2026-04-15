from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.agents.nodes import (
    analyst_node,
    critic_node,
    finalize_node,
    human_approval_node,
    planner_node,
    refusal_node,
    researcher_node,
    router_node,
    writer_node,
)
from app.core.state import AgentState


def route_from_router(state: AgentState) -> str:
    target = state.get("current_node", "planner")
    if target in {"planner", "researcher", "analyst", "writer", "critic", "human_approval", "refusal", "finalize"}:
        return target
    return "planner"


def route_after_node(state: AgentState) -> str:
    next_node = state.get("current_node", "finalize")
    trace = state.get("trace", [])
    last_node = str(trace[-1].get("node", "")) if trace else ""
    if state.get("status") == "rejected" and next_node == "finalize" and last_node != "finalize":
        return "finalize"

    if state.get("status") in {
        "awaiting_human",
        "completed",
        "failed",
        "stopped",
        "rejected",
        "timeout",
        "budget_exhausted",
    }:
        return "end"

    if next_node in {"planner", "researcher", "analyst", "writer", "critic", "human_approval", "refusal", "finalize"}:
        return next_node
    return "finalize"


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("router", router_node)
    graph.add_node("planner", planner_node)
    graph.add_node("researcher", researcher_node)
    graph.add_node("analyst", analyst_node)
    graph.add_node("refusal", refusal_node)
    graph.add_node("writer", writer_node)
    graph.add_node("critic", critic_node)
    graph.add_node("human_approval", human_approval_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "router")
    graph.add_conditional_edges(
        "router",
        route_from_router,
        {
            "planner": "planner",
            "researcher": "researcher",
            "analyst": "analyst",
            "writer": "writer",
            "critic": "critic",
            "human_approval": "human_approval",
            "refusal": "refusal",
            "finalize": "finalize",
        },
    )

    for node in ["planner", "researcher", "analyst", "writer", "critic", "human_approval", "refusal", "finalize"]:
        graph.add_conditional_edges(
            node,
            route_after_node,
            {
                "planner": "planner",
                "researcher": "researcher",
                "analyst": "analyst",
                "writer": "writer",
                "critic": "critic",
                "human_approval": "human_approval",
                "refusal": "refusal",
                "finalize": "finalize",
                "end": END,
            },
        )

    return graph.compile()
