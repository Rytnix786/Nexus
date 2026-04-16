from __future__ import annotations

from pathlib import Path


def test_alembic_env_bootstraps_backend_root_on_syspath() -> None:
    env_py = Path(__file__).resolve().parents[2] / "alembic" / "env.py"
    source = env_py.read_text(encoding="utf-8")

    # CI runs from backend/, so env.py must add backend root, not repository root.
    assert "path.dirname(path.dirname(path.abspath(__file__)))" in source
    assert "path.dirname(path.dirname(path.dirname(path.abspath(__file__))))" not in source