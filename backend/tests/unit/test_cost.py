"""
Test-Driven Development for cost module.
Tests cover known model pricing, unknown model fail-open, and Ollama free tier.
"""

import logging
import pytest

from app.core.cost import estimate_cost


class TestCostEstimation:
    """Test cost estimation for various providers and models."""

    def test_openai_gpt4_known_pricing(self):
        """Test cost calculation for known OpenAI GPT-4 model."""
        # OpenAI GPT-4 pricing: $0.03 per 1K prompt tokens, $0.06 per 1K completion tokens
        # 1000 prompt tokens, 500 completion tokens
        # Expected: (1000/1000 * 0.03) + (500/1000 * 0.06) = 0.03 + 0.03 = 0.06
        cost = estimate_cost(
            provider="openai",
            model="gpt-4",
            prompt_tokens=1000,
            completion_tokens=500
        )
        assert cost == pytest.approx(0.06, abs=1e-6)

    def test_anthropic_claude_known_pricing(self):
        """Test cost calculation for known Anthropic Claude model."""
        # Anthropic Claude 3 Sonnet pricing: $0.003 per 1K input tokens, $0.015 per 1K output tokens
        # 2000 input tokens, 1000 output tokens
        # Expected: (2000/1000 * 0.003) + (1000/1000 * 0.015) = 0.006 + 0.015 = 0.021
        cost = estimate_cost(
            provider="anthropic",
            model="claude-3-sonnet",
            prompt_tokens=2000,
            completion_tokens=1000
        )
        assert cost == pytest.approx(0.021, abs=1e-6)

    def test_ollama_free_tier(self):
        """Test that Ollama models always cost 0.0 (local/free)."""
        cost = estimate_cost(
            provider="ollama",
            model="llama3.2:1b",
            prompt_tokens=5000,
            completion_tokens=2000
        )
        assert cost == 0.0

    def test_ollama_any_model_free(self):
        """Test that any Ollama model is free regardless of size."""
        cost = estimate_cost(
            provider="ollama",
            model="whatever-large-model",
            prompt_tokens=10000,
            completion_tokens=5000
        )
        assert cost == 0.0

    def test_unknown_model_fail_open(self):
        """Test fail-open behavior: unknown model returns 0.0."""
        cost = estimate_cost(
            provider="openai",
            model="unknown-future-model",
            prompt_tokens=1000,
            completion_tokens=500
        )
        assert cost == 0.0

    def test_unknown_provider_fail_open(self):
        """Test fail-open behavior: unknown provider returns 0.0."""
        cost = estimate_cost(
            provider="hypothetical-provider",
            model="some-model",
            prompt_tokens=1000,
            completion_tokens=500
        )
        assert cost == 0.0

    def test_unknown_model_logs_warning(self, caplog):
        """Test that unknown model triggers a warning log."""
        with caplog.at_level(logging.WARNING):
            cost = estimate_cost(
                provider="openai",
                model="unknown-model-xyz",
                prompt_tokens=1000,
                completion_tokens=500
            )
        assert cost == 0.0
        # Verify warning was logged
        assert any("unknown" in record.message.lower() for record in caplog.records)

    def test_zero_tokens_zero_cost(self):
        """Test that zero tokens always yields zero cost."""
        cost = estimate_cost(
            provider="openai",
            model="gpt-4",
            prompt_tokens=0,
            completion_tokens=0
        )
        assert cost == 0.0

    def test_prompt_tokens_only(self):
        """Test cost calculation with only prompt tokens."""
        # GPT-4: $0.03 per 1K prompt tokens
        # 1000 prompt tokens, 0 completion tokens
        # Expected: 1000/1000 * 0.03 = 0.03
        cost = estimate_cost(
            provider="openai",
            model="gpt-4",
            prompt_tokens=1000,
            completion_tokens=0
        )
        assert cost == pytest.approx(0.03, abs=1e-6)

    def test_completion_tokens_only(self):
        """Test cost calculation with only completion tokens."""
        # GPT-4: $0.06 per 1K completion tokens
        # 0 prompt tokens, 500 completion tokens
        # Expected: 500/1000 * 0.06 = 0.03
        cost = estimate_cost(
            provider="openai",
            model="gpt-4",
            prompt_tokens=0,
            completion_tokens=500
        )
        assert cost == pytest.approx(0.03, abs=1e-6)

    def test_openai_gpt4o_known_pricing(self):
        """Modern OpenAI model names should return non-zero cost."""
        cost = estimate_cost(
            provider="openai",
            model="gpt-4o",
            prompt_tokens=1000,
            completion_tokens=500,
        )
        assert cost == pytest.approx(0.0125, abs=1e-6)

    def test_openai_versioned_model_resolves_family_pricing(self):
        """Version suffixes should inherit family pricing for supported models."""
        cost = estimate_cost(
            provider="openai",
            model="gpt-4o-2024-08-06",
            prompt_tokens=1000,
            completion_tokens=1000,
        )
        assert cost == pytest.approx(0.02, abs=1e-6)

    def test_anthropic_sonnet_46_known_pricing(self):
        """Configured Anthropic model names should return non-zero cost."""
        cost = estimate_cost(
            provider="anthropic",
            model="claude-sonnet-4-6",
            prompt_tokens=2000,
            completion_tokens=1000,
        )
        assert cost == pytest.approx(0.021, abs=1e-6)
