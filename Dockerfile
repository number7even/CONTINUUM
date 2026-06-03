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

# Sharp is a transitive dep of @xenova/transformers. Its prebuilt
# platform-specific binary normally lands via a postinstall script,
# which --ignore-scripts above blocks. Force the install so
# sharp-linux-x64.node is present and the embedder pipeline doesn't
# crash inside the worker pool on first batch. Discovered 2026-06-01
# during the V0.5 remote migrate (W23-1 Path B) — first run failed
# every batch with "Cannot find module sharp-linux-x64.node".
RUN npm install --no-save --ignore-scripts=false --platform=linux --arch=x64 sharp

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
# tini  — PID-1 init that reaps zombies and forwards SIGTERM cleanly.
# gosu  — non-fork privilege-drop for the entrypoint (W24-4 hardening).
# stat from coreutils ships in the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini gosu \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Container hardening (W24-4): create unprivileged user uid/gid 10001.
# The runtime PROCESS runs as `continuum` (post-entrypoint drop).
# /data is chowned at image-build so a fresh volume inherits the
# ownership; the entrypoint also re-chowns at runtime for upgrade safety.
RUN groupadd --system --gid 10001 continuum \
 && useradd  --system --uid 10001 --gid continuum \
              --home-dir /app --shell /usr/sbin/nologin continuum \
 && mkdir -p /data \
 && chown -R continuum:continuum /data

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

# Copy the privilege-drop entrypoint AFTER ownership of /app is settled.
COPY --chown=root:root entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Ensure /app is owned by `continuum` so the dropped process can read its
# own dist files. Done last so all COPY layers above land as root, then
# get rewritten in a single chown layer.
RUN chown -R continuum:continuum /app

EXPOSE 7878

# Docker / Fly / k8s liveness probe (W24-3).
# /healthz returns 503 when storage backend is degraded so the orchestrator
# can restart the container. start-period gives the storage probe + embedder
# load time before the first check fires.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7878/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini is PID 1 (reaps zombies + forwards SIGTERM) and execs entrypoint.sh.
# entrypoint.sh runs as root just long enough to chown /data, then drops to
# the unprivileged `continuum` user via gosu and execs CMD.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "packages/mcp-server/dist/http.js"]
