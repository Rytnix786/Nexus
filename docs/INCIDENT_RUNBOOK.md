# Incident Runbook

## Severity levels

- Sev1: total outage or data integrity risk
- Sev2: major degradation (core workflow unavailable for many users)
- Sev3: partial degradation with workaround

## First 15 minutes checklist

1. Confirm impact scope (frontend only, API only, stream only, full stack).
2. Freeze risky deploys.
3. Capture evidence:
   - failing endpoint
   - recent release SHA
   - error rates, logs, and request IDs
4. Apply immediate mitigation:
   - rollback latest release, or
   - disable risky feature flags (`AUTH_RBAC_V2`, `SSE_RESUME_V2`, `TOKEN_LEDGER_V2`) if needed.

## Core failure playbooks

### API 5xx spike

- Check database connectivity and migration state.
- Verify startup guards did not fail due to missing `JWT_SECRET`.
- Rollback if correlated with recent backend deploy.

### SSE instability

- Check stream endpoint status and replay path behavior.
- Verify `Last-Event-ID` handling and event persistence.
- Validate idempotency record writes and dedupe lookup latency.

### Auth/RBAC lockout

- Confirm JWT issuer/audience/secret configuration.
- Validate role claims shape (`role` or `roles`) in issued token.
- Temporarily re-enable legacy auth only with explicit incident approval.

### Quota/token anomalies

- Compare ledger totals vs run state totals.
- Check daily quota window creation/update logic.
- Pause new run starts if quota enforcement is inconsistent.

## Post-incident actions

- Publish incident timeline within 24h.
- Add regression test for root cause.
- Add/adjust alert thresholds and dashboards.
- Track follow-up items until verified in staging.
