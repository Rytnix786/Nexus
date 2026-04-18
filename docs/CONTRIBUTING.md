# Contributing

Thanks for contributing to Nexus Researcher.

## Run The Full Stack Locally

1. Clone and configure
```bash
git clone https://github.com/<owner>/nexus-researcher.git
cd nexus-researcher/NEXUS_R_Main
cp .env.example .env
```

2. Set required env vars in `.env`
- `POSTGRES_PASSWORD`
- `API_KEY`
- `JWT_SECRET`

3. Start services
```bash
docker compose up --build
```

4. Verify health
```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/health/ratelimit
```

5. Open UI
- Frontend: http://localhost:5173
- API: http://localhost:8000/api

## Run Tests And Evals

Backend tests:
```bash
cd backend
python -m pytest tests -q
```

Frontend unit tests:
```bash
cd frontend
npm test
```

Frontend E2E smoke:
```bash
cd frontend
npm run test:e2e
```

Promptfoo evals:
```bash
cd evals
npm run eval
npm run eval:view
```

Load tests:
```bash
cd backend/tests/load
python run_load_tests.py --profile smoke --no-web
```

## Code Conventions

Project conventions are enforced through the repository instruction baseline (CLAUDE-style coding rules used in this project setup):

- Use TDD for behavior changes: write a failing test first, then implementation.
- Keep increments small and verifiable.
- Review changes across five axes: correctness, readability, architecture, security, performance.
- Avoid mixing broad formatting-only edits with behavior changes.
- Never commit secrets.
- Validate user inputs at system boundaries.
- Run `pytest` after backend changes.

## Add A New LangGraph Node

1. Define node behavior
- File: `backend/app/agents/nodes.py`
- Add `def your_node_name(state: AgentState) -> dict[str, Any]:`
- Follow existing pattern: guard checks, deterministic state update, trace event emission.

2. Wire it into graph build
- File: `backend/app/agents/graph.py`
- Import the node function.
- Add `graph.add_node("your_node_name", your_node_name)`.
- Add routing entries in `route_from_router` and `route_after_node` maps if it is externally routable.
- Add conditional edges so the node is reachable and can transition out.

3. Update transition contract
- Ensure upstream node sets `current_node` to your node when routing condition is met.
- Ensure your node sets `current_node` to the correct next node.

4. Persist and stream compatibility check
- Confirm emitted trace event includes `event_type`, `node`, and useful `data`.
- Verify timeline shows your event in `/api/runs/{run_id}/timeline`.

5. Add tests (required)
- Unit test node behavior in `backend/tests/unit/`.
- Add routing test in graph tests to confirm edges and conditional flow.
- Add integration test for expected SSE timeline behavior if transition is externally visible.

6. Run validation
```bash
cd backend
python -m pytest tests -q
```

## Add A New Eval Case To nexus-test-cases.yaml

1. Edit eval case file
- File: `evals/nexus-test-cases.yaml`

2. Add a new case with required fields
- `objective`
- `context` (empty string allowed)
- `expectedBehavior` (for example `grounded-answer`, `refusal`, `secure-refusal`)
- Optional metadata fields (`description`, category tags) following existing style.

3. Keep behavior taxonomy consistent
- Use existing behavior labels so current evaluators score it correctly.

4. Run evals
```bash
cd evals
npm run eval
```

5. Inspect report
```bash
npm run eval:view
```

6. If needed, update evaluator logic
- File: `evals/evaluators.js`
- Keep changes minimal and deterministic.
