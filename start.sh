#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE_FILE="$ROOT_DIR/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  echo "Warning: .env not found. Created from .env.example. Please review values before production use."
fi

cd "$ROOT_DIR"
docker compose up --build -d

echo "Waiting for backend health at http://localhost:8000/api/health ..."
ready=0
for _ in {1..15}; do
  if curl -fsS "http://localhost:8000/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "Backend did not become healthy within 30 seconds."
  exit 1
fi

api_key_line="$(grep -E '^API_KEY=' "$ENV_FILE" || true)"
api_key="${api_key_line#API_KEY=}"

echo "Nexus is running at http://localhost:5173"
echo "API_KEY: $api_key"
