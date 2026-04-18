from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.exc import DatabaseError, OperationalError

from app.api.routes import router
from app.core.llm import get_llm_client
from app.core.logging import configure_logging, get_logger, request_id_var
from app.core.settings import settings
from app.db.repository import init_db
from app.db.session import SessionLocal


app = FastAPI(title=settings.app_name, version="0.1.0")
logger = get_logger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "Idempotency-Key",
        "Last-Event-ID",
        "X-Request-ID",
    ],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = (request.headers.get("X-Request-ID") or "").strip() or uuid.uuid4().hex
    token = request_id_var.set(request_id)
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)

    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    max_bytes = int(getattr(settings, "max_request_body_bytes", 0) or 0)
    if max_bytes > 0 and request.method in {"POST", "PUT", "PATCH"}:
        content_length = request.headers.get("content-length", "").strip()
        if content_length:
            try:
                if int(content_length) > max_bytes:
                    return JSONResponse(status_code=413, content={"detail": "Request body too large"})
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header"})

    response = await call_next(request)
    response.headers["Content-Security-Policy"] = settings.content_security_policy
    return response


@app.on_event("startup")
def on_startup() -> None:
    configure_logging()
    if settings.auth_rbac_v2 and not settings.jwt_secret:
        raise RuntimeError("AUTH_RBAC_V2 is enabled but JWT_SECRET is missing")
    get_llm_client()
    with SessionLocal() as session:
        bind = session.get_bind()
        if bind is None:
            raise RuntimeError("Database bind is not configured")

        if bind.dialect.name == "sqlite":
            init_db(session)
            return

        strict_migrations = bool(getattr(settings, "strict_migrations", True)) and settings.app_env == "production"

        try:
            inspector = inspect(bind)
            table_names = set(inspector.get_table_names())
            if "alembic_version" not in table_names:
                msg = "Run 'alembic upgrade head' before starting in production"
                if strict_migrations:
                    raise RuntimeError(msg)
                logger.warning(msg)
                return

            current_rev = session.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar_one_or_none()

            from alembic.config import Config
            from alembic.script import ScriptDirectory

            alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
            cfg = Config(str(alembic_ini))
            head_rev = ScriptDirectory.from_config(cfg).get_current_head()

            if current_rev != head_rev:
                msg = "Run 'alembic upgrade head' before starting in production"
                if strict_migrations:
                    raise RuntimeError(msg)
                logger.warning(msg)
        except (DatabaseError, OperationalError, FileNotFoundError, Exception) as exc:
            msg = "Run 'alembic upgrade head' before starting in production"
            if strict_migrations:
                raise RuntimeError(msg) from exc
            logger.warning(msg, extra={"error": type(exc).__name__})


app.include_router(router)
