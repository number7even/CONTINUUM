# Caddy + CONTINUUM self-hosted example

> One-command HTTPS-enabled CONTINUUM engine, suitable for a fresh VPS.

**Bound by [The Nine](../../../AGENTS.md) v0.1.0** — same engine that powers `continuum-engine.fly.dev`, just self-hosted.

## What's in this directory

| File | Role |
|---|---|
| `Caddyfile` | Caddy config — handles HTTPS via Let's Encrypt + reverse-proxy to the engine on `:7878` |
| `docker-compose.yml` | Two-service stack: Caddy + engine, sharing an internal Docker network |
| `.env.example` | Required env var template (domain, operator email, Bearer token) |

## Run it

```bash
cp .env.example .env
$EDITOR .env                  # set CONTINUUM_DOMAIN, _OPERATOR_EMAIL, _HTTP_TOKEN
docker compose up -d

# Should be live in ~30s (first build pulls deps + ~1min for ACME cert):
curl https://$(grep CONTINUUM_DOMAIN .env | cut -d= -f2)/healthz
```

Then register the MCP server in your AI client. For Claude Code (per-project `.mcp.json` or `~/.claude.json`):

```json
{
  "mcpServers": {
    "continuum-prod": {
      "url": "https://continuum.example.com/sse",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN_FROM_.env>" }
    }
  }
}
```

## DNS-01 challenge variant (for firewalled or private networks)

If your host can't expose port 80 to the internet (corporate firewall, internal-only VPS, behind Cloudflare strict mode), use Caddy's DNS-01 ACME challenge. You'll need API credentials for your DNS provider.

The default Caddy image doesn't ship most DNS plugins — use a community build that does. Example for Cloudflare:

```yaml
# In docker-compose.yml, replace the caddy service's image line:
services:
  caddy:
    image: ghcr.io/caddybuilds/caddy-cloudflare:2-alpine   # has cloudflare DNS module
    environment:
      CLOUDFLARE_API_TOKEN: ${CLOUDFLARE_API_TOKEN}        # scoped: Zone.DNS read+write
    # ...rest unchanged
```

And update the `Caddyfile`:

```caddyfile
{$CONTINUUM_DOMAIN} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy continuum-engine:7878
    # ...rest unchanged
}
```

For other DNS providers (Route53, DigitalOcean, etc.) see the [Caddy modules registry](https://caddyserver.com/download) and pick a community image that ships your provider's plugin.

## Updating

```bash
# Pull repo updates, rebuild image, restart engine. Data volumes persist.
git -C ../../.. pull
docker compose build continuum-engine
docker compose up -d continuum-engine
```

For Caddy itself:
```bash
docker compose pull caddy
docker compose up -d caddy
```

## Backup

The only volume worth backing up is `continuum_data` (everything else is regenerable):

```bash
docker run --rm -v continuum_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/continuum-$(date -u +%Y-%m-%dT%H-%M-%SZ).tar.gz -C /data .
```

Restore:
```bash
docker run --rm -v continuum_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/continuum-2026-06-02T12-00-00Z.tar.gz -C /data
```

See [`../../V0.5-HYBRID.md`](../../V0.5-HYBRID.md) for snapshot semantics + rollback path.

## See also

- [`../../DEPLOY_SELF_HOSTED.md`](../../DEPLOY_SELF_HOSTED.md) — the main self-hosting doc covering Caddy, nginx, Traefik
- [`../../V0.5-HYBRID.md`](../../V0.5-HYBRID.md) — V0.5 hybrid backend reference

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
