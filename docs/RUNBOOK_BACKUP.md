# Runbook — Hosted-State Backup & Restore (Fly.io)

> **Scope:** the hosted CONTINUUM engine at `continuum-engine.fly.dev`
> (app `continuum-engine`, region `iad`). Its only persistent state is the
> Fly volume `continuum_data` (`vol_r1j9ypn08jx9mqzr`, 1 GB, encrypted),
> mounted at the engine's data path and holding every tenant's
> `continuum.db` (SQLite) and vector sidecars.
>
> Self-hosted operators: your state lives in `~/.continuum/<project>/` on
> your own machine — back that directory up with your normal host backup
> tooling. This runbook covers only the Fly-hosted deployment.

## Objectives (defined 2026-06-12, P5-T5)

| Objective | Target | Mechanism |
|---|---|---|
| **RPO** (max data loss) | **24 hours** | Fly automatic **daily** volume snapshots (5-day retention), verified active — plus on-demand manual snapshots before risky changes. |
| **RTO** (max restore time) | **30 minutes** | Restore = create new volume from snapshot → redeploy machine against it (procedure below, ~10–15 min in practice; 30 min is the commitment ceiling). |

## What is backed up

- **Volume:** `vol_r1j9ypn08jx9mqzr` (`continuum_data`), 1 GB, encrypted at rest.
- **Cadence:** Fly takes one automatic snapshot per ~24 h; retention is
  **5 days**. Manual snapshots share the same retention unless extended.
- **First manual launch snapshot:** `vs_5z39mwQ9eaA0t3yk23jOmvX`
  (created 2026-06-12, the P5-T5 launch-day baseline).

> ⚠️ 5-day retention means a snapshot is **not** a long-term archive. For
> anything that must outlive 5 days, restore the snapshot to a volume and
> export the SQLite files off-platform (see "Off-platform export" below).

## Operator commands

```bash
# List snapshots for the volume
fly volumes snapshots list vol_r1j9ypn08jx9mqzr

# Take an on-demand snapshot (do this BEFORE risky deploys/migrations)
fly volumes snapshots create vol_r1j9ypn08jx9mqzr

# Check volume + machine attachment
fly volumes list -a continuum-engine
fly status -a continuum-engine
```

## Restore procedure (RTO drill)

1. **Pick the snapshot** to restore from:
   ```bash
   fly volumes snapshots list vol_r1j9ypn08jx9mqzr
   ```
2. **Create a new volume from the snapshot** (same region as the app):
   ```bash
   fly volumes create continuum_data \
     --snapshot-id <vs_...> \
     --region iad --size 1 -a continuum-engine
   ```
3. **Detach the old machine / attach the new volume.** The simplest safe
   path is to destroy the broken machine and clone with the new volume:
   ```bash
   fly machine list -a continuum-engine
   fly machine destroy <old-machine-id> --force -a continuum-engine
   fly deploy   # fly.toml [mounts] picks up the volume named continuum_data
   ```
   If two volumes named `continuum_data` exist, delete or rename the
   corrupted one first so the deploy binds the restored volume.
4. **Verify** the engine is healthy and serving restored state:
   ```bash
   curl -s https://continuum-engine.fly.dev/healthz
   # → 200, with tenantRegistry stats + process memory
   ```
   Then run one authenticated MCP roundtrip (e.g. the SSE smoke:
   `node scripts/http-smoke.mjs`) and confirm a known checkpoint is
   present via `continuum_get_state`.
5. **Clean up** the failed volume once the restore is verified:
   ```bash
   fly volumes destroy <old-vol-id>
   ```

## Off-platform export (long-term archive)

Snapshots live inside Fly with 5-day retention. For a durable archive:

```bash
# From a running machine, tar the data dir and pull it local
fly ssh console -a continuum-engine -C "tar czf /tmp/continuum-data.tgz -C /data ."
fly ssh sftp get /tmp/continuum-data.tgz ./backups/continuum-data-$(date +%Y%m%d).tgz -a continuum-engine
```

Run this before any retention-sensitive event (major migration, region
move, teardown). There is no automated off-platform archive yet — if the
hosted tier grows real tenants, automate this as a scheduled job and
extend this runbook.

## Failure modes this covers / does not cover

| Scenario | Covered? |
|---|---|
| Bad deploy corrupts the SQLite DBs | ✅ restore yesterday's snapshot (≤24 h loss) |
| Volume hardware loss | ✅ snapshots are stored independently of the volume |
| Region-wide Fly outage | ⚠️ restore requires Fly; RTO holds only once the platform is back |
| Mistake noticed after 5 days | ❌ snapshot expired — only the off-platform export saves you |
| Secrets / config loss (`fly secrets`) | ❌ not in the volume — keep `CONTINUUM_HTTP_TOKEN` etc. in your password manager |

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
