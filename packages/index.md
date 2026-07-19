---
name: "packages — the CONTINUUM engine workspaces"
description: "Map of the npm workspaces that make up the engine: core, mcp-server, cli, and the source adapters."
type: index
---
# packages/

- [core/](core/) — types, storage (SQLite+FTS5 / hybrid), checkpoints, todos, Truth Ledger, trust gradient, OKF export
- [mcp-server/](mcp-server/) — the MCP surface: tools, resources, prompts (stdio + HTTP/SSE)
- [cli/](cli/) — `continuum` CLI: init / start / serve / status / export-okf / authorship …
- [adapters/](adapters/) — source adapters: docs, git, export, remote-git, github-projects
