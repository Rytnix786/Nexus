# Promptfoo Integration - Implementation Summary

This document summarizes the automated evaluation framework that has been integrated into Nexus Researcher using **promptfoo**.

## What Was Added

### 1. Configuration Files

#### `promptfoo.yaml` (Root)
- Main evaluation configuration
- Defines API endpoint (Nexus `/api/start`)
- Configures 5 custom evaluators
- References test cases YAML file
- Sets up caching and output configuration

#### `evals/nexus-test-cases.yaml`
- 18 comprehensive test cases
- Three categories:
  - **Normal Queries** (5 cases): Single/multi-part queries with various context
  - **Insufficient Context** (3 cases): Queries that should trigger refusal
  - **Adversarial/Injection** (4 cases): Security tests (prompt injection, jailbreak, etc.)
  - **Edge Cases** (6 cases): Boundary conditions and special scenarios

#### `evals/evaluators.js`
- Custom JavaScript evaluators for agent response assessment
- 5 evaluation dimensions:
  1. **Groundedness**: Response is grounded in context (no hallucination)
  2. **Accuracy**: Factual correctness
  3. **Refusal Correctness**: Proper INSUFFICIENT_CONTEXT handling
  4. **Structure**: Required markdown sections present
  5. **Security**: Resistance to prompt injection and adversarial attacks

### 2. NPM Scripts

Added to `frontend/package.json`:
```json
"eval": "promptfoo eval -c ../promptfoo.yaml",
"eval:view": "promptfoo view -c ../promptfoo.yaml",
"eval:upload": "promptfoo share -c ../promptfoo.yaml"
```

### 3. CI/CD Integration

#### `.github/workflows/ci.yml`
- Automatically runs on pushes to main/develop
- Runs on PRs affecting agent code or eval configs
- **Workflow steps:**
  1. Set up Python & Node.js
  2. Start PostgreSQL and Ollama services
  3. Build backend and start API
  4. Run promptfoo evaluation (18 test cases × 5 evaluators)
  5. Generate interactive HTML report
  6. Comment results on PR
  7. Fail if overall score < 0.75

### 4. Documentation & Setup Scripts

#### `README.md`
- Comprehensive evaluation guide
- How to run evaluations locally
- Test case schema and explanation
- Scoring interpretation
- Troubleshooting guide
- Advanced usage examples

#### `evals/setup.sh` (Linux/Mac)
```bash
source evals/setup.sh
# Checks prerequisites
# Starts backend if needed  
# Installs dependencies
# Sets up environment variables
```

#### `evals/setup.bat` (Windows)
```cmd
call evals\setup.bat
# Same as above for Windows
```

#### `evals/.gitignore`
- Excludes cache and results from version control
- Patterns: `.cache/`, `results.json`, `node_modules/`

## Test Coverage

### Categories

| Category | Count | Purpose |
|----------|-------|---------|
| Normal Queries | 5 | Verify grounded answers |
| No Context | 3 | Verify refusal behavior |
| Adversarial | 4 | Security testing |
| Edge Cases | 6 | Boundary conditions |
| **Total** | **18** | Comprehensive evaluation |

### Evaluator Matrix

| Test → Evaluator | Groundedness | Accuracy | Refusal | Structure | Security |
|------------------|-------------|----------|---------|-----------|----------|
| Normal Query | ✓ | ✓ | ✓ | ✓ | ✓ |
| No Context | ✓ | ✓ | ✓ | ✗ | ✓ |
| Adversarial | ✓ | ✓ | ✓ | ✗ | ✓ |
| Edge Case | ✓ | ✓ | ✓ | ✓ | ✓ |

**Total Evaluations**: 18 test cases × 5 evaluators = 90 evaluations per run

## Evaluation Metrics

### Scoring Scale
- **0.90 - 1.00**: Excellent (production ready)
- **0.80 - 0.89**: Good (minor improvements)
- **0.70 - 0.79**: Acceptable (needs attention)
- **0.60 - 0.69**: Poor (significant issues)
- **< 0.60**: Critical (blocks deployment)

### Per-Evaluator Thresholds
- **CI Pass threshold**: 0.75 overall score
- **Per-test minimum**: 0.5 score
- **Recommended baseline**: 0.85+ for production readiness

## Running Evaluations

### Locally

**Setup (one time):**
```bash
cd frontend
npm install promptfoo
```

**Run evaluation:**
```bash
# From project root
npm run eval

# Or from frontend directory
npm run eval

# View interactive report
npm run eval:view
```

**Expected duration**: 2-3 minutes

### In CI

- Runs automatically on PR/push to main/develop
- Results uploaded as artifacts
- Comments on PR with summary
- Fails if score < 0.75

## Key Features

### ✅ No Runtime Code Changes
- Evaluation layer is completely separate
- Does not modify agent logic or API
- Pure assessment tool

### ✅ Comprehensive Coverage
- 18 diverse test cases
- 5 evaluation dimensions
- Covers happy path, refusal, and security scenarios

### ✅ Custom Evaluators
- Implemented in JavaScript (no LLM calls for logic)
- Fast evaluation (~2-3 min for full suite)
- Easy to extend and modify

### ✅ CI/CD Ready
- GitHub Actions workflow configured
- Automated result reporting
- PR integration with comments

### ✅ Reproducible & Caching
- Deterministic test execution
- Results caching for faster re-runs
- Baseline comparison support

### ✅ Production-Ready Assessment
- Groundedness check (no hallucination)
- Security validation (injection resistance)
- Proper refusal behavior verification

## Next Steps

1. **Baseline**: Run evaluation on current branch
   ```bash
   npm run eval
   ```

2. **Monitor**: Evaluate on PRs automatically (already configured)

3. **Improve Agent Logic**: Review low-scoring test cases
   - Check analyst node refusal logic
   - Verify cross-encoder scoring for groundedness
   - Audit security evaluator edge cases

4. **Track Trends**: Compare scores across commits
   ```bash
   npm run eval:upload  # Optional: share to promptfoo.dev
   ```

5. **Expand Tests**: Add domain-specific test cases
   - Edit `evals/nexus-test-cases.yaml`
   - Run `npm run eval` to include new cases

## File Structure

```
NEXUS_R_Main/
├── promptfoo.yaml              # Main config
├── evals/
│   ├── nexus-test-cases.yaml  # 18 test cases
│   ├── evaluators.js          # 5 custom evaluators
│   ├── evaluators.js          # 5 custom evaluators
│   ├── setup.sh               # Linux/Mac setup
│   ├── setup.bat              # Windows setup
│   ├── .gitignore             # Git ignore rules
│   ├── .cache/                # Promptfoo cache (excluded)
│   └── results.json           # Evaluation results (excluded)
├── .github/
│   └── workflows/
│       └── ci.yml             # CI/CD workflow
└── frontend/
    └── package.json           # Added eval scripts
```

## Troubleshooting

### Backend Not Running
```bash
# Start backend
docker compose up -d backend
docker compose logs -f backend
```

### Promptfoo Not Found
```bash
cd frontend
npm install promptfoo
```

### Low Groundedness Scores
1. Check that context is being passed correctly
2. Verify analyst node refusal threshold (should be < 2 sources or < 200 chars)
3. Review researcher node context retrieval

### Low Security Scores
1. Check that adversarial requests are being refused
2. Verify response doesn't contain system instructions
3. Look for command execution patterns in output

## References

- **Promptfoo Docs**: https://www.promptfoo.dev/
- **Custom Evaluators**: https://www.promptfoo.dev/docs/configuration/custom-evaluators
- **Nexus Operational Docs**: `docs/`
- **Evaluation Guide**: `README.md`

---

**Last Updated**: April 15, 2026
**Status**: Active & Integrated
**Next Review**: After next major agent change
