# syntax=docker/dockerfile:1.7
#
# CONTINUUM engine container — runs the V1 HTTP/SSE MCP server on a
# long-running daemon with a persistent disk for SQLite + ruvector state.
#
# Stage 1 (builder): node:20 + native build toolchain → npm install
# (compiles better-sqlite3 native addon), build TS → dist.
# Stage 2 (runtime): node:20-slim, copies dist + node_modules from builder.
# Final image ~600-900 MB depending on whether ruvector/@xenova/transformers
# native binaries are present (V0.5 hybrid backend opt-in).
#
# CMD launches the HTTP transport entry (packages/mcp-server/dist/http.js).
# Env vars expected:
#   CONTINUUM_HTTP_TOKEN     — required (Bearer shared secret)
#   CONTINUUM_HTTP_PORT      — default 7878
#   CONTINUUM_PROJECT_ID     — default 'continuum'
#   CONTINUUM_DATA_DIR       — default /data (persistent volume mount point)
#   CONTINUUM_STORAGE_BACKEND — sqlite (default) | hybrid (opt-in V0.5)

# ─── Stage 1 ── builder ─────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ libc6-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy package manifests first for Docker layer caching — only re-installs
# when package*.json change, not on every source edit.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json                       packages/core/
COPY packages/mcp-server/package.json                 packages/mcp-server/
COPY packages/cli/package.json                        packages/cli/
COPY packages/adapters/docs/package.json              packages/adapters/docs/
COPY packages/adapters/git/package.json               packages/adapters/git/
COPY packages/adapters/export/package.json            packages/adapters/export/
COPY apps/console/package.json                        apps/console/

# Install all workspaces. --ignore-scripts skips lifecycle scripts (some
# transitive ML deps run heavy postinstall hooks we don't need at build
# time); native modules (better-sqlite3) build via the rebuild below.
RUN npm ci --workspaces --include-workspace-root --ignore-scripts || npm install

# Compile better-sqlite3 against the Node runtime in this image.
RUN npm rebuild better-sqlite3 --workspace=@continuum/core

# Bring in source + tsconfigs
COPY packages packages/

# Build the engine + the ops-CLI surface.
# (apps/console is a Vercel concern.)
# CLI + adapters are included so the operator can run `continuum migrate`,
# `continuum reindex`, `continuum verify`, `continuum adapter docs --watch`
# etc inside the container via `fly ssh console`. Added 2026-06-01 to
# support the V0.5 hybrid promotion remote-backfill workflow.
RUN npm run build --workspace=@continuum/core \
 && npm run build --workspace=@continuum/mcp-server \
 && npm run build --workspace=@continuum/cli \
 && npm run build --workspace=@continuum/adapter-docs \
 && npm run build --workspace=@continuum/adapter-git

# ─── Stage 2 ── runtime ────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

# better-sqlite3 native addon links against glibc — already in node:20-slim.
# Add tini as PID 1 for graceful SIGTERM handling (Fly sends SIGTERM on stop).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules + dist from builder. Skip source + tests + .next.
# The npm workspaces symlinks under node_modules/@continuum/* point at
# packages/*/, so each workspace's package.json + dist must be present
# in the runtime tree or those symlinks dangle.
COPY --from=builder /build/node_modules                          ./node_modules
COPY --from=builder /build/package.json                          ./
COPY --from=builder /build/packages/core/package.json            packages/core/
COPY --from=builder /build/packages/core/dist                    packages/core/dist/
COPY --from=builder /build/packages/mcp-server/package.json      packages/mcp-server/
COPY --from=builder /build/packages/mcp-server/dist              packages/mcp-server/dist/
# Ops-CLI + adapters (added 2026-06-01 for V0.5 migrate/reindex/verify
# over `fly ssh console`).
COPY --from=builder /build/packages/cli/package.json             packages/cli/
COPY --from=builder /build/packages/cli/dist                     packages/cli/dist/
COPY --from=builder /build/packages/adapters/docs/package.json   packages/adapters/docs/
COPY --from=builder /build/packages/adapters/docs/dist           packages/adapters/docs/dist/
COPY --from=builder /build/packages/adapters/git/package.json    packages/adapters/git/
COPY --from=builder /build/packages/adapters/git/dist            packages/adapters/git/dist/

ENV NODE_ENV=production
ENV CONTINUUM_HTTP_PORT=7878
ENV CONTINUUM_DATA_DIR=/data
ENV CONTINUUM_PROJECT_ID=continuum

# Persistent disk for SQLite + ruvector state.
VOLUME ["/data"]

EXPOSE 7878

# tini reaps zombies + forwards SIGTERM cleanly to the Node child.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "packages/mcp-server/dist/http.js"]
