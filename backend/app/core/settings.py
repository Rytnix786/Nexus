from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    app_name: str = Field(default="Nexus Orchestrator")
    app_env: str = Field(default="development")
    api_prefix: str = Field(default="/api")
    cors_allowed_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")

    ollama_base_url: str = Field(default="http://ollama:11434")
    # Keep in sync with OLLAMA_MODEL in docker-compose.yml
    ollama_model: str = Field(default="llama3.2:1b")
    ollama_timeout_seconds: float = Field(default=120.0)
    ollama_num_predict: int = Field(default=220)
    ollama_keep_alive: str = Field(default="20m")

    tavily_api_key: str = Field(default="")
    tavily_base_url: str = Field(default="https://api.tavily.com")
    tavily_timeout_seconds: float = Field(default=20.0)
    web_search_enabled: bool = Field(default=False)
    web_search_max_results: int = Field(default=5)

    database_url: str = Field(default="sqlite:///./nexus_local.db")

    max_iterations: int = Field(default=6)
    max_run_seconds: int = Field(default=180)
    default_token_budget: int = Field(default=8000)
    developer_mode: bool = Field(default=False)

    # Node-specific token limits
    token_limit_planner: int = Field(default=280)
    token_limit_researcher: int = Field(default=420)
    token_limit_analyst: int = Field(default=520)
    token_limit_writer: int = Field(default=900)
    token_limit_critic: int = Field(default=420)
    token_limit_min: int = Field(default=64)
    token_limit_max: int = Field(default=2000)
    
    # Writer output requirements
    writer_min_draft_length: int = Field(default=700)
    writer_min_completion_length: int = Field(default=900)

    allow_unsafe_python_tool: bool = Field(default=False)
    require_api_key: bool = Field(default=True)
    api_key: str = Field(default="")
    run_requests_per_minute: int = Field(default=30)
    redis_url: str = Field(default="redis://localhost:6379/0")
    rate_limit_enabled: bool = Field(default=True)
    strict_migrations: bool = Field(default=True)
    max_request_body_bytes: int = Field(default=2 * 1024 * 1024)
    content_security_policy: str = Field(
        default="default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://localhost:5173 http://127.0.0.1:5173; frame-ancestors 'none'; base-uri 'self'"
    )
    token_ledger_v2: bool = Field(default=True)
    auth_rbac_v2: bool = Field(default=True)
    sse_resume_v2: bool = Field(default=True)
    api_contract_v2: bool = Field(default=True)
    quota_daily_tokens: int = Field(default=200000)
    upload_max_files: int = Field(default=5)
    upload_context_max_chars: int = Field(default=20000)
    enforce_report_completeness: bool = Field(default=False)

    langsmith_enabled: bool = Field(default=False)
    langsmith_api_key: str = Field(default="")
    langsmith_project: str = Field(default="nexus-researcher")

    jwt_secret: str = Field(default="")
    jwt_algorithm: str = Field(default="HS256")
    jwt_issuer: str = Field(default="")
    jwt_audience: str = Field(default="")
    idempotency_ttl_minutes: int = Field(default=120)


settings = Settings()
