from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from anthropic import Anthropic
from openai import OpenAI

from app.core.settings import settings


class ConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class LLMGenerationResult:
    text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    metering_mode: str
    provider: str
    model: str


class LLMClient(Protocol):
    provider: str
    model: str

    def generate(self, prompt: str, *, max_tokens: int) -> LLMGenerationResult:
        ...


def _normalize_provider(provider: str) -> str:
    normalized = provider.strip().lower()
    if normalized not in {"ollama", "openai", "anthropic"}:
        raise ConfigurationError(f"Unsupported LLM_PROVIDER: {provider!r}")
    return normalized


class OllamaLLMClient:
    provider = "ollama"

    def __init__(self, model: str, base_url: str, timeout_seconds: float, keep_alive: str) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.keep_alive = keep_alive

    def generate(self, prompt: str, *, max_tokens: int) -> LLMGenerationResult:
        import httpx

        response_url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {
                "num_predict": max_tokens,
            },
        }

        with httpx.Client() as client:
            response = client.post(response_url, json=payload, timeout=max(10.0, float(self.timeout_seconds)))
            response.raise_for_status()
            body = response.json()

        response_text = str(body.get("response", "")).strip() if isinstance(body, dict) else str(body).strip()
        if not response_text:
            response_text = response.text.strip()

        prompt_tokens = int(body.get("prompt_eval_count", 0)) if isinstance(body, dict) else 0
        completion_tokens = int(body.get("eval_count", 0)) if isinstance(body, dict) else 0
        exact_total = prompt_tokens + completion_tokens
        estimated_total = max(1, len(response_text) // 4)
        total_tokens = exact_total if exact_total > 0 else estimated_total
        if exact_total > 0:
            return LLMGenerationResult(
                text=response_text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                metering_mode="provider_exact",
                provider=self.provider,
                model=self.model,
            )

        return LLMGenerationResult(
            text=response_text,
            prompt_tokens=0,
            completion_tokens=total_tokens,
            total_tokens=total_tokens,
            metering_mode="estimated",
            provider=self.provider,
            model=self.model,
        )


class OpenAILLMClient:
    provider = "openai"

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self._client = OpenAI(api_key=api_key)

    def generate(self, prompt: str, *, max_tokens: int) -> LLMGenerationResult:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        choice = response.choices[0] if response.choices else None
        response_text = ""
        if choice is not None and choice.message is not None and choice.message.content is not None:
            response_text = str(choice.message.content).strip()

        usage = response.usage
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        total_tokens = int(getattr(usage, "total_tokens", prompt_tokens + completion_tokens) or (prompt_tokens + completion_tokens))
        return LLMGenerationResult(
            text=response_text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            metering_mode="provider_exact",
            provider=self.provider,
            model=self.model,
        )


class AnthropicLLMClient:
    provider = "anthropic"

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self._client = Anthropic(api_key=api_key)

    def generate(self, prompt: str, *, max_tokens: int) -> LLMGenerationResult:
        response = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = "".join(
            str(block.text)
            for block in response.content
            if getattr(block, "type", "") == "text" and getattr(block, "text", None) is not None
        ).strip()
        usage = response.usage
        prompt_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        total_tokens = prompt_tokens + completion_tokens
        return LLMGenerationResult(
            text=response_text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            metering_mode="provider_exact",
            provider=self.provider,
            model=self.model,
        )


def get_llm_client() -> LLMClient:
    provider = _normalize_provider(str(getattr(settings, "llm_provider", "ollama") or "ollama"))
    model = str(getattr(settings, "llm_model", "") or "").strip()
    if not model:
        raise ConfigurationError("LLM_MODEL must be set")

    if provider == "ollama":
        return OllamaLLMClient(
            model=model,
            base_url=str(getattr(settings, "ollama_base_url", "http://ollama:11434")),
            timeout_seconds=float(getattr(settings, "ollama_timeout_seconds", 120.0)),
            keep_alive=str(getattr(settings, "ollama_keep_alive", "20m")),
        )
    if provider == "openai":
        api_key = str(getattr(settings, "openai_api_key", "") or "").strip()
        if not api_key:
            raise ConfigurationError("LLM_PROVIDER=openai requires OPENAI_API_KEY")
        return OpenAILLMClient(model=model, api_key=api_key)
    if provider == "anthropic":
        api_key = str(getattr(settings, "anthropic_api_key", "") or "").strip()
        if not api_key:
            raise ConfigurationError("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY")
        return AnthropicLLMClient(model=model, api_key=api_key)

    raise ConfigurationError(f"Unsupported LLM_PROVIDER: {provider!r}")