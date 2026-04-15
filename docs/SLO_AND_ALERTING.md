# SLO and Alerting Policy

## Service level objectives

- API availability (monthly): >= 99.9%
- Run start success rate (5m rolling): >= 99.5%
- Approval resume success rate (5m rolling): >= 99.5%
- Timeline freshness during active run: <= 10s median
- p95 `POST /api/runs/stream` request latency: <= 1200ms (excluding model runtime)

## Error budget

- Monthly downtime budget: 43m 49s
- Burn alerts:
  - Warn: 25% budget consumed
  - Critical: 50% budget consumed
  - Freeze: 80% budget consumed (feature freeze except reliability fixes)

## Mandatory alerts

- `api_5xx_rate > 2% for 5m` (critical)
- `sse_disconnect_rate > 10% for 5m` (warn)
- `run_failed_rate > 5% for 10m` (critical)
- `idempotency_duplicate_spike > 3x baseline` (warn)
- `quota_exceeded_events > threshold` (warn)
- `token_metering_mode=estimated share > 40%` (warn)

## Dashboard minimum panels

- Requests by endpoint/status
- Active runs, awaiting approvals, terminal outcomes
- SSE reconnect/replay count
- Token totals per run and per quota subject
- Quota consumption vs daily limit
- Idempotency hits/misses

## On-call response targets

- Acknowledge critical page: <= 5m
- First mitigation: <= 15m
- Incident update cadence: every 15m until resolved
