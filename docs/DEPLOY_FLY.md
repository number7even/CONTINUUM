# Deploy the CONTINUUM engine to Fly.io

> One-time walkthrough to replace the cloudflared quick-tunnel with a
> production-grade hosted backend. ~30 min from zero to a public engine
> URL serving SSE traffic.

---

## Prereqs

1. **Fly account + CLI** — sign up at https://fly.io, then:

   ```bash
   brew install flyctl
   fly auth login
   ```

2. **Token from `~/.continuum/bridge.env`** — you'll set this as a Fly
   secret in step 3, NOT in `fly.toml` (where it would be visible in `fly
   config show`):

   ```bash
   cat ~/.continuum/bridge.env
   # → CONTINUUM_HTTP_TOKEN=<your hex token>
   ```

   If you don't have one yet: `bash scripts/serve.sh` will generate it.

---

## One-time launch

### 1. Create the Fly app + persistent volume

```bash
cd /Users/emporiumcollection/Development/supabase-projects/CONTINUUM

# Create the app (no immediate deploy). Reads fly.toml.
fly launch --no-deploy --copy-config --name continuum-engine

# Create a 1 GB persistent volume in the primary region.
# Name MUST match `[mounts].source` in fly.toml ("continuum_data").
fly volumes create continuum_data --size 1 --region iad
```

### 2. Set the auth secret

```bash
TOKEN=$(grep CONTINUUM_HTTP_TOKEN ~/.continuum/bridge.env | cut -d= -f2)
fly secrets set CONTINUUM_HTTP_TOKEN="$TOKEN"
```

`fly secrets set` triggers a redeploy on its own, but it'll fail the first
time because we haven't pushed the image yet. That's fine.

### 3. Deploy

```bash
fly deploy
```

First build takes ~5–8 minutes (compiling better-sqlite3 native addon).
Subsequent deploys are ~1–2 minutes (Docker layer cache).

### 4. Verify

```bash
# Public URL will be https://continuum-engine.fly.dev
fly status
fly logs

# Health check from anywhere:
curl https://continuum-engine.fly.dev/healthz
# → {"ok":true,"version":"0.0.1","transport":"http+sse","sessions":0}

# Full MCP roundtrip from anywhere (replace TOKEN):
curl -fsSL https://continuum-engine.fly.dev/sse \
  -H "Authorization: Bearer $TOKEN" \
  --max-time 5  # first event arrives, then exit
```

---

## Wire the Vercel frontend to the hosted engine

Vercel project → **Settings → Environment Variables**:

| Var | New value |
|---|---|
| `CONTINUUM_HTTP_URL` | `https://continuum-engine.fly.dev/sse` |
| `CONTINUUM_HTTP_TOKEN` | (same as the Fly secret) |
| `CONTINUUM_PROJECT_ID` | `continuum` |

→ **Deployments → ⋯ → Redeploy**. Page should now render the **Connected**
panel reliably, ~400–800 ms roundtrip, no cloudflared in the path.

---

## Attach `api.continuum.rest` (or similar) as a stable custom domain

You already own `continuum.rest`. Recommended split:

- `continuum.rest` + `www.continuum.rest` → Vercel frontend (current setup)
- `api.continuum.rest` → Fly engine

```bash
fly certs add api.continuum.rest
# → prints required DNS records (CNAME api → continuum-engine.fly.dev,
#    plus an _acme-challenge TXT record for cert validation)
```

Add those records at your DNS provider (Cloudflare / Vercel DNS / wherever
`continuum.rest` is managed). Once Fly sees the records:

```bash
fly certs show api.continuum.rest
# → wait for "Status: ready"
```

Update Vercel env var to `CONTINUUM_HTTP_URL=https://api.continuum.rest/sse`,
redeploy. Now you have a fully branded AaaS endpoint, no Fly subdomain
exposed to customers.

---

## Day-2 operations

| Task | Command |
|---|---|
| Tail logs | `fly logs` |
| Restart | `fly machine restart` |
| Scale up memory (e.g. for V0.5 hybrid backend) | `fly scale memory 1024` |
| Rotate auth token | `fly secrets set CONTINUUM_HTTP_TOKEN=$(openssl rand -hex 32)` (also update Vercel env + redeploy Vercel) |
| Inspect persistent disk | `fly ssh console` then `ls -la /data` |
| Cost dashboard | https://fly.io/dashboard |

---

## Cost expectations (MVP)

- 1× `shared-cpu-1x` 512MB always-on: **~$3.19/mo** at standard pricing.
- 1 GB volume: **~$0.15/mo**.
- Bandwidth: free up to 160 GB/mo outbound (plenty for MVP).
- TLS certs: free.

**Total MVP backend cost: ~$3.50/mo.** Fly Hobby plan ($5/mo) covers this
plus headroom.

---

## Rollback / teardown

```bash
# Stop the engine (machine still exists, billing pauses)
fly scale count 0

# Resume
fly scale count 1

# Nuke everything (irreversible)
fly volumes destroy continuum_data
fly apps destroy continuum-engine
```

Persistent volume backups: enable via `fly volumes snapshots create
continuum_data` — Fly auto-snapshots daily on paid plans, but explicit
snapshots before risky deploys are cheap insurance.
