# CONTINUUM + AMF smoke suite — the CI referee.
#
# `make smoke`  — the single local entry point: builds, then runs EVERY deterministic,
#                 network-free proof-gate. Any gate failing halts (exit 1) → no corrupted
#                 merge. This is the same command CI runs.
# `make smoke-integration` — the network-dependent tests (semantic model download · live
#                 news feed), kept OUT of the blocking gate so a third-party outage can't
#                 false-fail CI. Run manually / on a schedule.
.PHONY: build smoke smoke-integration
export CONTINUUM_STORAGE_BACKEND = sqlite

build:
	npm run build -w @number7even/continuum-core -w @number7even/continuum-mcp-server -w @number7even/continuum-cli -w @number7even/continuum-adapter-github-projects

smoke: build
	@echo "── CONTINUUM proof-gates ──────────────────────────────────"
	node scripts/verify-ask-retrieval.mjs
	node scripts/verify-authorship-phase1.mjs
	node scripts/verify-authorship-phase2.mjs
	node scripts/verify-authorship-phase3.mjs
	node scripts/verify-discussion-audio.mjs
	node scripts/verify-ball.mjs
	node scripts/verify-truth-ledger.mjs
	node scripts/verify-board-gate.mjs
	node scripts/verify-mcp-truth-loop.mjs
	node scripts/verify-console-board.mjs
	node scripts/verify-commit-board.mjs
	node scripts/verify-github-projects-adapter.mjs
	@echo "── AMF pipeline gates + fix proof-gates ───────────────────"
	node apps/amf/worker/vault-guard.mjs --smoke
	node apps/amf/worker/feedback-sync.mjs --smoke
	node apps/amf/worker/content-matcher.mjs --smoke
	node apps/amf/worker/adapter-news.mjs --smoke
	node apps/amf/worker/verify-odometer.mjs
	node apps/amf/worker/verify-render-hang.mjs
	node apps/amf/worker/verify-dashboard.mjs
	@echo "✓ SMOKE SUITE GREEN — 19 deterministic gates passed"

smoke-integration: build
	CONTINUUM_STORAGE_BACKEND=hybrid node scripts/verify-semantic-search.mjs
	node apps/amf/worker/verify-dogfood.mjs
	@echo "✓ integration suite green (network-dependent)"
