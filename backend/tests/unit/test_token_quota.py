from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import repository
from app.db.tables import Base


test_engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

Base.metadata.create_all(test_engine)


def test_quota_window_accumulates_tokens():
    with TestingSessionLocal() as session:
        initial = repository.get_or_create_daily_quota(session, "tester")
        assert int(initial.tokens_used) == 0
        updated = repository.consume_quota_tokens(session, "tester", 120)
        assert int(updated.tokens_used) == 120
        updated_again = repository.consume_quota_tokens(session, "tester", 30)
        assert int(updated_again.tokens_used) == 150


def test_existing_daily_quota_lookup_does_not_create_rows():
    with TestingSessionLocal() as session:
        subject = "fresh-tester"
        assert repository.get_existing_daily_quota(session, subject) is None

        created = repository.get_or_create_daily_quota(session, subject)
        assert int(created.tokens_used) == 0

        found = repository.get_existing_daily_quota(session, subject)
        assert found is not None
        assert int(found.tokens_used) == 0
