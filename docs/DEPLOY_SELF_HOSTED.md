# Self-hosting CONTINUUM — OSS / Docker baseline

> **Bound by [The Nine](../AGENTS.md) v0.1.0.**
>
> **Audience:** operators who want to run CONTINUUM on their own server (a VPS, a homelab box, a managed Docker host) with HTTPS, persistence, and process supervision. The same engine that runs on `continuum-engine.fly.dev` runs in your container; you own the TLS terminator and the data volume.
>
> **Promise:** `git clone` → `cp .env.example .env` (paste a token) → `docker compose up -d` → working HTTPS endpoint in under 10 minutes on a fresh VPS, no native compilation, no Node install on the host.

---

## Architecture

```
            ┌──────────────────────────┐
   HTTPS    │   TLS terminator         │   plain HTTP (internal docker net)
  (443)  ──>│   Caddy / nginx / Traefik│ ─────────────────────┐
            │   (you own TLS)          │                      │
            └──────────────────────────┘                      v
                                                ┌──────────────────────┐
                                                │  continuum-engine    │
                                                │  port 7878 (HTTP)    │
                                                │  /healthz /readyz    │
                                                │  /sse + Bearer auth  │
                                                └──────────┬───────────┘
                                                           │
                                                           v
                                              ┌────────────────────────┐
                                              │ /data (persistent vol) │
                                              │   continuum.db (SQLite)│
                                              │   ruvector.db (HNSW)   │
                                              └────────────────────────┘
```

**The engine never speaks TLS.** This is deliberate:

- TLS terminators (Caddy, nginx, Traefik) handle ACME, certificate rotation, OCSP stapling, modern cipher suites, and HTTP/2/3 — better than we ever could in a Node process.
- Engine stays a thin HTTP/SSE app on `:7878`, talkable to from any container or sidecar.
- Operators who already run nginx / Caddy / Traefik for other apps add CONTINUUM as one more upstream — no second TLS stack to babysit.

If you don't already have a reverse-proxy story, **use Caddy.** It's the shortest path to HTTPS-by-default.

---

## Quick start — Caddy + Docker Compose (recommended)

The fastest path. Assumes you have a public domain pointed at your server (`continuum.example.com → <your IP>`) and ports 80 + 443 open in your firewall.

```bash
# 1. Clone the repo (or just copy docs/examples/caddy/ — you don't need the rest)
git clone https://github.com/number7even/CONTINUUM.git
cd CONTINUUM/docs/examples/caddy

# 2. Configure the shared-secret Bearer token + your domain
cp .env.example .env
# Edit .env:
#   - CONTINUUM_DOMAIN=continuum.example.com   ← your real domain
#   - CONTINUUM_HTTP_TOKEN=<openssl rand -hex 32 output>
#   - operator@example.com  (Caddy uses this for Let's Encrypt account)

# 3. Build the image + boot the stack
docker compose up -d

# 4. Confirm it's running
curl https://continuum.example.com/healthz
# → {"ok":true,"version":"0.0.1",...}

# 5. Register the MCP server in any AI client
# Example for Claude Code (per-project .mcp.json or ~/.claude.json):
#   {
#     "mcpServers": {
#       "continuum-prod": {
#         "url": "https://continuum.example.com/sse",
#         "headers": { "Authorization": "Bearer <the token from your .env>" }
#       }
#     }
#   }
```

On first run, Caddy will:
1. Resolve your domain's A/AAAA records.
2. Solicit a Let's Encrypt certificate via the HTTP-01 challenge (port 80 must be reachable from the internet).
3. Start serving HTTPS on port 443, proxying all traffic to `continuum-engine:7878` via the internal Docker network.

**Cert renewal is automatic.** Caddy stores certs in the `caddy_data` volume and rotates them in the background.

If your operator profile already has DNS-01 setup (Cloudflare, Route53), see `docs/examples/caddy/README.md` for the DNS-challenge variant — that removes the port-80 reachability requirement.

---

## Configuration reference

### Authentication — pick ONE mode

The engine supports two mutually-exclusive auth modes at startup. **Pick one per deployment.** The mode is determined by which env vars are set.

#### Mode A — Shared-secret Bearer (V1 default, simplest)

| Variable | Default | Purpose |
|---|---|---|
| `CONTINUUM_HTTP_TOKEN` | **(required for this mode)** | Bearer shared secret. Generate with `openssl rand -hex 32`. Every MCP client sends `Authorization: Bearer <this>`. |

When `CONTINUUM_HTTP_TOKEN` is set AND no JWT env vars are set, the engine boots in shared-secret mode. This is what the Vercel frontend uses today and is fully sufficient for single-operator OSS deployments.

#### Mode B — JWT (bring-your-own-OAuth, V1.1)

When `CONTINUUM_JWT_ISSUER` AND `CONTINUUM_JWT_AUDIENCE` are both set, the engine boots in JWT mode. The shared-secret env var is **ignored** (you pick one mode — operator clarity).

| Variable | Default | Purpose |
|---|---|---|
| `CONTINUUM_JWT_ISSUER` | **(required for this mode)** | The OIDC issuer URL (e.g. `https://your-tenant.auth0.com/`). The engine fetches JWKS from `<issuer>/.well-known/jwks.json` and caches it (rotating automatically when new kids appear). |
| `CONTINUUM_JWT_AUDIENCE` | **(required for this mode)** | The expected `aud` claim. Configured in your OIDC provider when you register the CONTINUUM API as a resource. |
| `CONTINUUM_JWT_TENANT_CLAIM` | `tenant` | Which JWT claim to read into `req.user.tenant`. Auth0 typically uses a namespaced claim like `https://yourdomain.com/tenant`; Clerk uses `org_id`; Keycloak uses `tenant` or a custom one. **Tenant routing is not yet wired** — that's V1.2 work — but the auth boundary lands here. |

Tested OIDC providers: any compliant issuer with a standards-compliant JWKS endpoint and RS256-signed tokens. We've validated against synthetic JWKS in CI; production validation against Auth0 / Clerk / Keycloak is part of the W24 exit criteria.

**Backwards compatibility:** with only `CONTINUUM_HTTP_TOKEN` set, behavior is unchanged from V1. Existing deployments (Vercel frontend, Fly engine, all OSS self-hosters) keep working — no migration required to upgrade to V1.1.

### Required Caddy variables (only if using the Caddy example)

| Variable | Default | Purpose |
|---|---|---|
| `CONTINUUM_DOMAIN` | **(required for Caddy)** | The public domain Caddy obtains certs for. Must have A/AAAA records pointing at the host. |
| `CONTINUUM_OPERATOR_EMAIL` | **(required for Caddy)** | Used in the Let's Encrypt account registration. Renewal-failure notices go here. |

### Optional environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CONTINUUM_PROJECT_ID` | `continuum` | Project-scope identifier (also the SQLite filename subdir). |
| `CONTINUUM_STORAGE_BACKEND` | `hybrid` | `hybrid` = SQLite + RuVector + MiniLM (default); `sqlite` = V0 fallback. |
| `CONTINUUM_EMBED_WORKERS` | `min(cores, 4)` | Embedder worker pool size. **On 512MB VPS, set to `1`** — each worker holds ~75MB. |
| `CONTINUUM_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Any sentence-transformers model `@xenova/transformers` can load. Changing requires `continuum reindex` (see V0.5-HYBRID.md). |
| `CONTINUUM_BRIEFING_WINDOW_HOURS` | `24` | Window for the session-briefing recent-activity summary. |
| `CONTINUUM_HTTP_PORT` | `7878` | Internal HTTP port the engine listens on. Don't change unless you also change `Caddyfile` / nginx upstream / Traefik labels. |

### Memory profile per VPS class

| VPS size | Recommended `CONTINUUM_EMBED_WORKERS` | Notes |
|---|---|---|
| 256MB | `0` (disabled — inline embed) | Risky — RuVector + Node alone hit ~200MB. Recommend 512MB minimum. |
| 512MB | `1` (one worker) | Workable for trickle ingest. **Bulk migration will OOM** at this size — run `continuum migrate` from your laptop and `sftp put` the `ruvector.db` instead. We learned this the hard way on Fly. |
| 1GB | `2` | Comfortable for steady-state. Bulk migration may OOM (we hit it at 1GB during W23-1). |
| 2GB+ | `min(cores, 4)` | Bulk migration runs cleanly. |

This is honest (P4) — `@xenova/transformers` running ONNX in WASM pre-allocates a sizeable heap regardless of model size. Sizing memory generously is cheaper than fighting it.

### Persistence

The engine writes to `/data` inside the container. The Caddy compose example maps this to a named volume `continuum_data`. **Snapshot or back this volume up regularly** — it holds:

- `continuum.db` — SQLite (source of truth for everything)
- `ruvector.db` — vector index (rebuildable from SQLite via `continuum reindex`)

Migration / disaster recovery procedures in [`V0.5-HYBRID.md`](./V0.5-HYBRID.md).

---

## Alternative: nginx + Certbot

If you already run nginx and have a certbot pipeline, this drop-in serves the same role as Caddy:

```nginx
# /etc/nginx/sites-available/continuum.conf
server {
    listen 80;
    server_name continuum.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name continuum.example.com;

    ssl_certificate     /etc/letsencrypt/live/continuum.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/continuum.example.com/privkey.pem;

    # SSE-friendly proxy settings — DO NOT BUFFER.
    location / {
        proxy_pass         http://127.0.0.1:7878;   # or docker container IP
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";    # required for SSE keep-alive
        proxy_buffering    off;                     # required for SSE
        proxy_read_timeout 24h;                     # SSE streams live a long time
        proxy_send_timeout 24h;
    }
}
```

Then run the engine in Docker on `127.0.0.1:7878`:

```bash
docker run -d \
  --restart=unless-stopped \
  --name continuum-engine \
  -p 127.0.0.1:7878:7878 \
  -v continuum_data:/data \
  -e CONTINUUM_HTTP_TOKEN=$(openssl rand -hex 32) \
  -e CONTINUUM_EMBED_WORKERS=1 \
  ghcr.io/number7even/continuum-engine:latest  # OR build locally and tag yourself
```

(GHCR publication is not yet automated — for now you'll need to `docker build -t continuum-engine .` from a clone of the repo.)

Issue + renew certs with certbot the normal way:
```bash
sudo certbot --nginx -d continuum.example.com
```

---

## Alternative: Traefik (labels-driven, docker-compose-native)

For operators already running Traefik as the cluster ingress, add labels to the engine service:

```yaml
# docker-compose.yml (Traefik + CONTINUUM)
services:
  traefik:
    image: traefik:v3
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.email=operator@example.com"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.le.acme.httpchallenge=true"
      - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_letsencrypt:/letsencrypt

  continuum-engine:
    build: ../../..   # path to repo root from this compose file
    restart: unless-stopped
    environment:
      CONTINUUM_HTTP_TOKEN: ${CONTINUUM_HTTP_TOKEN}
      CONTINUUM_EMBED_WORKERS: ${CONTINUUM_EMBED_WORKERS:-1}
    volumes:
      - continuum_data:/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.continuum.rule=Host(`continuum.example.com`)"
      - "traefik.http.routers.continuum.entrypoints=websecure"
      - "traefik.http.routers.continuum.tls.certresolver=le"
      - "traefik.http.services.continuum.loadbalancer.server.port=7878"

volumes:
  traefik_letsencrypt:
  continuum_data:
```

Traefik handles ACME natively; no separate certbot daemon. SSE works out of the box (Traefik doesn't buffer by default).

---

## SSE-specific caveats (all terminators)

CONTINUUM's `/sse` endpoint is a long-lived HTTP/1.1 stream. Three things to watch:

1. **Disable response buffering** at the proxy. nginx needs `proxy_buffering off`; Caddy and Traefik handle this by default.
2. **Read timeout must be long** (hours, not minutes). A typical AI-client session keeps the SSE open for the duration of the conversation. nginx default of 60s will hard-close mid-stream.
3. **Connection: ""** header (nginx) — strips the inbound `Connection: keep-alive` header that breaks HTTP/1.1 upgrade-style proxying.

If `/healthz` works from the public URL but `/sse` 504s or hangs, the proxy is buffering. Recheck these three.

---

## Process supervision

Three layers, each independently useful:

### Inside the container — `tini` as PID 1 + Docker HEALTHCHECK

The engine's `Dockerfile` uses `tini` as the entrypoint:
```dockerfile
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "packages/mcp-server/dist/http.js"]
```

`tini` reaps zombie processes and forwards SIGTERM cleanly to the Node child. If you `docker stop continuum-engine`, the engine gets ~10s to close SQLite + WAL cleanly, then SIGKILL.

The Dockerfile also declares a **`HEALTHCHECK`** that hits `/healthz` every 30 seconds (5s timeout, 3 retries, 30s start-period grace for the embedder model to load). `/healthz` returns **503 when storage is degraded** — orchestrators (Docker, Fly, k8s, nomad) automatically restart the container on persistent failure. Inspect from the host:

```bash
docker inspect --format='{{.State.Health.Status}}' continuum-engine
# starting | healthy | unhealthy
docker inspect --format='{{json .State.Health}}' continuum-engine | jq
```

### Liveness vs readiness — `/healthz` vs `/readyz`

Two endpoints, two signals:

| Endpoint | Signal | Returns 200 when | Returns 503 when | Use for |
|---|---|---|---|---|
| `/healthz` | **liveness** | process responsive AND SQLite OK AND embedder warm | SQLite degraded, embedder failed | Docker HEALTHCHECK · k8s livenessProbe · Fly machine_check |
| `/readyz` | **readiness** | first storage + embedder warm-up complete | startup not finished, or storage probe failed | k8s readinessProbe · load balancer route gate |

`/readyz` exists specifically to **eliminate the cold-start race**: when a fresh container starts, MiniLM model load takes 3-5s. A client hitting `/sse` during that window would block. Orchestrators gate traffic on `/readyz` 200 to avoid this.

Both endpoints carry the same enriched body shape (storage backend, sqlite/ruvector status, embedder flag, uptime) so monitoring dashboards can read either.

### Outside the container — restart policy

The compose examples all set `restart: unless-stopped`. If the Node process crashes (OOM, bug, segfault) the container restarts automatically. SQLite's WAL mode recovers from unclean shutdown without data loss.

For **non-Docker** self-hosters (running `node packages/mcp-server/dist/http.js` directly under systemd), here's a working unit file:

```ini
# /etc/systemd/system/continuum-engine.service
[Unit]
Description=CONTINUUM engine (MCP HTTP/SSE)
After=network.target

[Service]
Type=simple
User=continuum
WorkingDirectory=/opt/continuum
Environment=NODE_ENV=production
Environment=CONTINUUM_HTTP_PORT=7878
Environment=CONTINUUM_DATA_DIR=/var/lib/continuum
Environment=CONTINUUM_PROJECT_ID=continuum
Environment=CONTINUUM_HTTP_TOKEN=...
Environment=CONTINUUM_EMBED_WORKERS=1
ExecStart=/usr/bin/node packages/mcp-server/dist/http.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now continuum-engine
sudo systemctl status continuum-engine
journalctl -u continuum-engine -f
```

---

## Container hardening (W24-4)

The default image runs as an **unprivileged user** (`continuum`, uid/gid `10001`) and is built to support the standard Docker isolation flags. Combine the image-side defaults with the runtime flags below for a defence-in-depth posture.

### Image-side defaults (built in, no operator action required)

- **Non-root execution.** PID 1 is `tini`; entrypoint runs root briefly to chown `/data` (handles operators upgrading from a pre-W24-4 image), then drops to `continuum` (uid 10001) via `gosu`. The Node process runs unprivileged.
- **No shell for the runtime user.** `/usr/sbin/nologin` so even if an attacker escapes the Node sandbox they can't `docker exec -u continuum sh`.
- **Volume ownership chowned at build.** Fresh `/data` volumes inherit the `continuum` uid; existing volumes are migrated by the entrypoint on first run.
- **Sharp + better-sqlite3 native bindings** pre-built for `linux-x64` in the image (no install-time compilation surface).

### Recommended `docker run` flags

For maximum isolation when running standalone (without the included Caddy compose stack — which already isolates the engine on an internal network with no public ports):

```bash
docker run -d \
  --name continuum-engine \
  --restart=unless-stopped \
  --read-only \
  --tmpfs /tmp:size=64m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit 512 \
  -p 127.0.0.1:7878:7878 \
  -v continuum_data:/data \
  -e CONTINUUM_HTTP_TOKEN=$(openssl rand -hex 32) \
  -e CONTINUUM_EMBED_WORKERS=1 \
  ghcr.io/number7even/continuum-engine:latest
```

What each flag buys you:

| Flag | What it does | Why |
|---|---|---|
| `--read-only` | Root filesystem mounted read-only | Container can't write outside `/data` + `/tmp` |
| `--tmpfs /tmp:size=64m` | Writable RAM mount for `/tmp` | better-sqlite3 + npm need a scratch dir |
| `--cap-drop=ALL` | Drop every Linux capability | Engine doesn't need any privileged ops |
| `--security-opt=no-new-privileges` | Block setuid/setgid escalation | Belt-and-braces with the non-root user |
| `--pids-limit 512` | Cap process count in the container | Prevents fork-bomb DoS |
| `-p 127.0.0.1:7878:7878` | Bind to loopback only | Caddy/nginx on the host fronts TLS — engine is never directly internet-exposed |

The Caddy + docker-compose example in [`examples/caddy/`](./examples/caddy/) already provides equivalent isolation via the internal Docker network (engine has no `ports:` block at all — only Caddy is reachable from outside).

### Image vulnerability scanning

The repository's CI workflow runs `npm audit --omit=dev --audit-level=high` on every push (W24-4). For deployed images, scan with `trivy` or `grype` before promoting to production:

```bash
# Trivy — fastest, broadest CVE database
docker pull aquasec/trivy:latest
docker run --rm aquasec/trivy image ghcr.io/number7even/continuum-engine:latest

# Grype — Anchore's CVE scanner, complementary signal
docker run --rm anchore/grype:latest ghcr.io/number7even/continuum-engine:latest
```

Add either to your CD pipeline as a gating step before promoting to prod.

### Current npm audit baseline (P4 — honest)

As of 2026-06-03 the production dependency tree carries the following known CVEs, all in the `@xenova/transformers → onnxruntime-web → onnx-proto → protobufjs` chain:

| Severity | Advisory | Impact |
|---|---|---|
| Critical | GHSA-jvwf-75h9-cwgg | protobufjs process-wide DoS via unsafe option paths |
| High | GHSA-685m-2w69-288q | protobufjs DoS via unbounded recursion |
| High | GHSA-q6x5-8v7m-xcrf | protobufjs overlong UTF-8 decoding |
| High | GHSA-jggg-4jg4-v7c6 | protobufjs DoS via unbounded recursive JSON descriptor expansion |

**Mitigation analysis:**

- All four are **denial-of-service**, not RCE / data exfiltration. Worst case is the engine process crashes — `--restart=unless-stopped` brings it back.
- The vulnerable code path requires **user-controlled protobuf bytes** to reach the embedder. CONTINUUM's embedder only sees Observation **content** which (a) has already passed through the privacy filter at write-time, (b) is plain UTF-8 text, never raw protobuf, and (c) is never sourced from un-trusted public input — only from operator-controlled adapters (docs, git, AI sessions).
- **No upstream fix is available.** `@xenova/transformers` has not published a patched release; the audit's suggested fix (`npm audit fix --force`) would DOWNGRADE the package and break the V0.5 hybrid backend.
- The 1 critical + 3 high will surface in any scan today. The CI gate is wired to catch **future** additions; the current findings are documented as accepted-with-mitigation pending upstream patch.

When `@xenova/transformers` publishes a fixed release, bump the pin, re-run `npm audit`, and these entries disappear without code change.

---

## Troubleshooting

### `curl https://continuum.example.com/healthz` returns "connection refused"

- Check Caddy logs: `docker compose logs caddy`
- Most common: DNS isn't pointed at the host yet, OR port 80 is blocked by the host firewall (Caddy needs port 80 for HTTP-01 ACME challenge — even if you only serve on 443 after).

### Cert issuance fails with "challenge failed"

- Port 80 not reachable from the public internet. Open it temporarily, OR switch to DNS-01 (see `docs/examples/caddy/README.md`).
- Domain doesn't resolve to your server. `dig +short continuum.example.com` should return your IP.

### `/healthz` works but `/sse` hangs or 504s

- Proxy is buffering. See "SSE-specific caveats" above.
- For nginx: triple-check `proxy_buffering off` AND `proxy_read_timeout`.

### Container OOMs during `continuum migrate`

- You're on a too-small VPS. See "Memory profile per VPS class" above.
- Workaround: run migrate on your laptop, `sftp put` the resulting `ruvector.db` to the volume, restart container. Same pattern as `docs/V0.5-HYBRID.md` for the local-compute bridge.

### `npm audit` flags a high-severity CVE in production deps

- This sprint (W24-4) wires `npm audit --audit-level=high` into the build. Until that lands, audit manually: `npm audit --production --audit-level=high`. Patches land in the next release tag.

### Authentication: shared-secret token feels too simple

- It is — by design for V1.1. W24-2 lands JWT validation against your own OIDC issuer (Auth0, Clerk, Keycloak, Authelia). Stay on shared-secret in V1.1; opt into JWT in V1.1+ once your auth provider is wired.

---

## See also

- [`examples/caddy/`](./examples/caddy/) — the one-command Caddy + Docker Compose example referenced above.
- [`V0.5-HYBRID.md`](./V0.5-HYBRID.md) — V0.5 hybrid storage backend reference: migration, performance, memory tuning, rollback.
- [`UX-JOURNEYS.md`](./UX-JOURNEYS.md) — the three customer journeys; self-hosted Docker is the Journey-3+ pattern.
- [`SPRINT-2026-W24.md`](./SPRINT-2026-W24.md) — current sprint scope; W24-1 (this doc) is the first ticket.
- [`../AGENTS.md`](../AGENTS.md) — The Nine v0.1.0 discipline binding.

---

_Bound by The Nine v0.1.0._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
