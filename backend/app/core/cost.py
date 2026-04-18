"""
Cost estimation module for LLM API calls.
Provides pricing calculation for various LLM providers.

Pricing data as of 2025-Q4:
- OpenAI GPT-4: $0.03/1K prompt tokens, $0.06/1K completion tokens
- Anthropic Claude 3 Sonnet: $0.003/1K input tokens, $0.015/1K output tokens
- Ollama: Free (local/self-hosted)

Unknown models and providers fail open to $0.0 cost with a warning log.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)

# Pricing table: provider -> model -> (prompt_cost_per_1k, completion_cost_per_1k)
COST_TABLE: dict[str, dict[str, tuple[float, float]]] = {
    "openai": {
        "gpt-4": (0.03, 0.06),
        "gpt-4-turbo": (0.01, 0.03),
        "gpt-4o": (0.005, 0.015),
        "gpt-4.1": (0.005, 0.015),
        "gpt-3.5-turbo": (0.0005, 0.0015),
    },
    "anthropic": {
        "claude-3-sonnet": (0.003, 0.015),
        "claude-sonnet-4-6": (0.003, 0.015),
        "claude-3-opus": (0.015, 0.075),
        "claude-3-haiku": (0.00025, 0.00125),
    },
    "ollama": {},  # All Ollama models are free
}


MODEL_FAMILIES: dict[str, tuple[str, ...]] = {
    "openai": ("gpt-4.1", "gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"),
    "anthropic": ("claude-sonnet-4-6", "claude-3-sonnet", "claude-3-opus", "claude-3-haiku"),
}


def _resolve_model_prices(provider: str, model: str) -> tuple[float, float] | None:
    provider_prices = COST_TABLE.get(provider, {})
    if not provider_prices:
        return None

    normalized_model = str(model or "").lower().strip()
    if normalized_model in provider_prices:
        return provider_prices[normalized_model]

    for family in MODEL_FAMILIES.get(provider, ()):  # fail-open if family cannot be inferred
        if normalized_model.startswith(family):
            return provider_prices.get(family)

    return None


def estimate_cost(
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    """
    Estimate the cost in USD for an LLM API call.

    Args:
        provider: The LLM provider (e.g., "openai", "anthropic", "ollama")
        model: The model name (e.g., "gpt-4", "claude-3-sonnet")
        prompt_tokens: Number of prompt tokens used
        completion_tokens: Number of completion tokens generated

    Returns:
        Estimated cost in USD. Returns 0.0 for unknown providers/models.

    Examples:
        >>> estimate_cost("openai", "gpt-4", 1000, 500)
        0.06
        >>> estimate_cost("ollama", "llama3.2:1b", 1000, 500)
        0.0
        >>> estimate_cost("openai", "unknown-model", 1000, 500)
        0.0
    """
    # Ollama is always free
    if provider == "ollama":
        return 0.0

    normalized_provider = str(provider or "").lower().strip()

    # Get provider pricing table
    provider_prices = COST_TABLE.get(normalized_provider)
    if not provider_prices:
        logger.warning(
            f"Unknown LLM provider '{provider}'; failing open to $0.0 cost",
            extra={"provider": provider, "model": model},
        )
        return 0.0

    # Get model pricing
    model_prices = _resolve_model_prices(normalized_provider, model)
    if not model_prices:
        logger.warning(
            f"Unknown model '{model}' for provider '{provider}'; failing open to $0.0 cost",
            extra={"provider": provider, "model": model},
        )
        return 0.0

    prompt_price_per_1k, completion_price_per_1k = model_prices

    # Calculate total cost
    prompt_cost = (prompt_tokens / 1000) * prompt_price_per_1k
    completion_cost = (completion_tokens / 1000) * completion_price_per_1k

    return prompt_cost + completion_cost
