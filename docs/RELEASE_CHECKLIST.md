# Release Checklist

## Pre-release gates (must pass)

- Backend tests green: `python -m pytest tests -q`
- Frontend unit tests green: `npm run test`
- Frontend e2e smoke green: `npm run test:e2e`
- Frontend production build green: `npm run build`
- Backend compile check green: `python -m compileall app`
- Security workflow green:
  - `pip-audit --strict`
  - `npm audit --audit-level=high`

## Configuration gates

- `AUTH_RBAC_V2=true` and `JWT_SECRET` configured.
- `SSE_RESUME_V2=true` and idempotency TTL configured.
- `TOKEN_LEDGER_V2=true` and quota limits configured.
- CORS allowlist set to real environment domains.
- API key fallback disabled in production unless break-glass approved.

## Staging validation

- Start run, verify timeline streaming.
- Force reconnect and verify replay from `Last-Event-ID`.
- Verify approval gate note requirement and audit trail.
- Verify duplicate start/resume with same idempotency key is safe.
- Verify quota exceed path returns deterministic error.

## Deploy and rollback plan

- Tag release and keep previous stable image available.
- Deploy backend first, then frontend.
- Monitor first 30 minutes against SLO dashboard.
- Rollback criteria:
  - 5xx > 2% for 5m
  - start/resume success < 99%
  - severe auth lockout or replay corruption

## Post-release checks

- Confirm no alert regressions.
- Confirm token/quota dashboards updating.
- Confirm audit timeline integrity on new runs.
