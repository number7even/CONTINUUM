# Contributing to Continuum

Thank you for your interest in Continuum.

This project is in **v0 design phase**. Architecture is locked
([`ARCHITECTURE.md`](./ARCHITECTURE.md)). Code begins after the remaining 8
design decisions in §14 close.

## Repository scope

Continuum is a **monorepo** managed with npm workspaces.

```
continuum/
├── packages/
│   ├── core/             - Aggregator, indexer, state, checkpoints, todos
│   ├── mcp-server/       - MCP stdio + HTTP server
│   ├── cli/              - `continuum init/start/status/checkpoint`
│   └── adapters/         - Source adapters (pluggable)
│       ├── docs/         - /docs RAG
│       ├── git/          - git log / diff
│       ├── export/       - Claude session JSONL
│       ├── claude-mem/   - V0.5
│       └── sona/         - V0.5
├── docs/                 - User-facing docs
├── tests/                - Cross-package integration tests
├── ARCHITECTURE.md       - System design (source of truth)
└── README.md
```

## Branching

- `main` — protected, releasable.
- `feature/<short-name>` — new work.
- `fix/<short-name>` — bug fixes.

Open a PR. One reviewer minimum. Squash-merge by default.

## Development environment

- Node.js >= 20
- npm >= 10

```bash
npm install        # installs workspace deps
npm run build      # builds all packages
npm run test       # runs all tests
npm run lint       # lints everything
```

## Commit messages

Conventional Commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`.

Examples:

```
feat(core): implement Aggregator interface
fix(adapter/git): handle empty repo gracefully
docs(architecture): lock D2 — Chroma as embedding store
```

## Design discussions

Significant design decisions are tracked in
[`ARCHITECTURE.md` §14 Open Decisions](./ARCHITECTURE.md#14-open-decisions).
Lock a decision by opening a PR that updates the table from `pending` →
`✅ Locked YYYY-MM-DD` with a brief rationale in the body.

## License

By contributing, you agree your contributions are licensed under
[Apache License 2.0](./LICENSE).

## Code of conduct

Be honest. Be kind. Ship truth.
