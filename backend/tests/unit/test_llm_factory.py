from __future__ import annotations

import pytest

import app.core.llm as llm
from app.core.settings import Settings


@pytest.fixture(autouse=True)
def _reset_llm_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(llm, "settings", Settings())
    yield


@pytest.mark.parametrize(
    ("provider", "expected_type"),
    [
        ("ollama", llm.OllamaLLMClient),
        ("openai", llm.OpenAILLMClient),
        ("anthropic", llm.AnthropicLLMClient),
    ],
)
def test_get_llm_client_returns_expected_client(provider: str, expected_type: type[object], monkeypatch: pytest.MonkeyPatch):
    settings = Settings()
    setattr(settings, "llm_provider", provider)
    settings.llm_model = {
        "ollama": "llama3.2",
        "openai": "gpt-4o",
        "anthropic": "claude-sonnet-4-6",
    }[provider]
    settings.openai_api_key = "test-openai-key"
    settings.anthropic_api_key = "test-anthropic-key"
    monkeypatch.setattr(llm, "settings", settings)

    client = llm.get_llm_client()

    assert isinstance(client, expected_type)
    assert client.provider == provider
    assert client.model == settings.llm_model


@pytest.mark.parametrize(
    ("provider", "api_key_field", "expected_message"),
    [
        ("openai", "openai_api_key", "LLM_PROVIDER=openai requires OPENAI_API_KEY"),
        ("anthropic", "anthropic_api_key", "LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY"),
    ],
)
def test_get_llm_client_raises_configuration_error_when_api_key_missing(
    provider: str,
    api_key_field: str,
    expected_message: str,
    monkeypatch: pytest.MonkeyPatch,
):
    settings = Settings()
    setattr(settings, "llm_provider", provider)
    settings.llm_model = "test-model"
    setattr(settings, api_key_field, "")
    monkeypatch.setattr(llm, "settings", settings)

    with pytest.raises(llm.ConfigurationError, match=expected_message):
        llm.get_llm_client()


def test_get_llm_client_defaults_to_ollama_when_provider_unset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setattr(llm, "settings", Settings())

    client = llm.get_llm_client()

    assert isinstance(client, llm.OllamaLLMClient)
    assert client.provider == "ollama"
    assert client.model == "llama3.2:1b"
