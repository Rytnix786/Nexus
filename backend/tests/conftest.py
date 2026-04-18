from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REQUIRE_API_KEY", "false")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("AUTH_RBAC_V2", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.agents.nodes as nodes
import app.api.routes as api_routes
from app.main import app
from app.core.settings import settings
from app.db.session import get_session
from app.db.tables import Base


test_engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)

    def override_get_session():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    yield
    app.dependency_overrides.pop(get_session, None)


class _FakeOllamaResponse:
    def __init__(self, text: str) -> None:
        self._text = text

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, str]:
        return {"response": self._text}

    @property
    def text(self) -> str:
        return self._text


class _FakeOllamaClient:
    provider = "ollama"
    model = "nexus-model"

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url: str, json: dict[str, object], timeout: float | None = None):
        prompt = str(json.get("prompt", "")).lower()
        if "research plan" in prompt or "break the objective into 3-5 concrete research steps" in prompt:
            text = "1. Scope the objective.\n2. Gather evidence.\n3. Synthesize recommendations."
        elif "research agent" in prompt:
            text = (
                "- Key evidence collected from multiple reliable sources with detailed analysis.\n"
                "- Relevant patterns observed across the data showing consistent trends.\n"
                "- Follow-up questions noted for deeper investigation in future phases.\n"
                "- Additional findings indicate strong alignment with best practices.\n"
                "- Supporting documentation provides comprehensive references."
            )
        elif "you are an analyst" in prompt:
            text = "The research is consistent and points to a clear implementation path."
        elif "you are a report writer" in prompt:
            text = (
                "Summary:\nThe objective can be completed with a phased rollout.\n\n"
                "Key Findings:\n- The plan is actionable.\n- The risks are manageable.\n\n"
                "Recommendations:\n- Proceed in stages.\n- Validate each milestone."
            )
        elif "critical reviewer" in prompt:
            text = "APPROVED: The draft is accurate, complete, and clear."
        else:
            text = "Generated response."
        return _FakeOllamaResponse(text)

    def generate(self, prompt: str, *, max_tokens: int):
        from app.core.llm import LLMGenerationResult

        prompt_text = str(prompt).lower()
        if "research plan" in prompt_text or "break the objective into 3-5 concrete research steps" in prompt_text:
            text = "1. Scope the objective.\n2. Gather evidence.\n3. Synthesize recommendations."
        elif "research agent" in prompt_text:
            text = (
                "- Key evidence collected from multiple reliable sources with detailed analysis.\n"
                "- Relevant patterns observed across the data showing consistent trends.\n"
                "- Follow-up questions noted for deeper investigation in future phases.\n"
                "- Additional findings indicate strong alignment with best practices.\n"
                "- Supporting documentation provides comprehensive references."
            )
        elif "you are an analyst" in prompt_text:
            text = "The research is consistent and points to a clear implementation path."
        elif "you are a report writer" in prompt_text:
            text = (
                "Summary:\nThe objective can be completed with a phased rollout.\n\n"
                "Key Findings:\n- The plan is actionable.\n- The risks are manageable.\n\n"
                "Recommendations:\n- Proceed in stages.\n- Validate each milestone."
            )
        elif "critical reviewer" in prompt_text:
            text = "APPROVED: The draft is accurate, complete, and clear."
        else:
            text = "Generated response."
        completion_tokens = max(1, len(text) // 4)
        return LLMGenerationResult(
            text=text,
            prompt_tokens=0,
            completion_tokens=completion_tokens,
            total_tokens=completion_tokens,
            metering_mode="provider_exact",
            provider=self.provider,
            model=self.model,
        )


@pytest.fixture(autouse=True)
def fake_ollama_client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(nodes, "get_llm_client", lambda: _FakeOllamaClient())
    monkeypatch.setattr(nodes.settings, "llm_provider", "ollama")
    monkeypatch.setattr(nodes.settings, "llm_model", "nexus-model")
    yield


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_headers(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(settings, "require_api_key", True)
    monkeypatch.setattr(settings, "api_key", "test-api-key")
    return {"X-API-Key": "test-api-key"}
