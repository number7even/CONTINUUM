/**
 * openStorage() factory — single entry point for choosing the V0 vs V0.5
 * storage backend at runtime.
 *
 * W23-1 sub-deliverable 4 (2026-06-01): default flipped from `sqlite`
 * to `hybrid` after the benchmark gates passed under revised G1.
 * Operators on V0 SQLite-only opt OUT via env var:
 *
 *   CONTINUUM_STORAGE_BACKEND=hybrid    (DEFAULT — V0.5 SQLite + RuVector + MiniLM)
 *   CONTINUUM_STORAGE_BACKEND=ruvector  → HybridStorageBackend (alias for `hybrid`)
 *   CONTINUUM_STORAGE_BACKEND=sqlite    → SQLiteStorageBackend (V0 opt-out)
 *
 * The hybrid backend's heavy deps (ruvector native bindings,
 * @xenova/transformers ONNX runtime) are LAZY-LOADED inside the class —
 * importing this factory does not pull them. The first observation
 * insert (or vector query) is what triggers the load.
 *
 * Existing V0 projects (SQLite-only DBs without a ruvector.db sidecar)
 * work UNCHANGED on the new default — Hybrid creates an empty
 * ruvector.db on first open, and new observations get embedded going
 * forward. To backfill the vector store with PRE-V0.5 observations,
 * run `continuum migrate --backend hybrid` once. See docs/V0.5-HYBRID.md.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { StorageBackend } from './storage.js';
import { SQLiteStorageBackend } from './storage-sqlite.js';
import { HybridStorageBackend } from './storage-hybrid.js';
import { sanitiseTenantId } from './tenant.js';

/**
 * Open a tenant-scoped StorageBackend.
 *
 * The single public entry point for choosing the V0 vs V0.5 storage
 * backend at runtime. As of W27-1 (V1.2 multi-tenant), the input is
 * SANITISED at the boundary — adversarial input (path traversal, null
 * bytes, control characters, etc) THROWS rather than returning a
 * backend bound to a malformed filesystem path.
 *
 * Parameter semantics widened in W27-1: `tenantId` was previously
 * called `projectId` and treated as "project name" — same routing
 * mechanism, broader interpretation as "the verified tenant or local
 * workspace identifier." Existing single-tenant callers passing
 * lowercase alphanumeric project names (e.g. `vc-hospitality`,
 * `continuum`) continue to work unchanged.
 *
 * @throws Error('continuum: invalid tenant identifier') if sanitisation
 *         fails. Callers in the auth-validated HTTP/SSE chain should
 *         map this to HTTP 400; CLI/stdio callers map to exit 1.
 */
export function openStorage(tenantId: string): StorageBackend {
  const sanitised = sanitiseTenantId(tenantId);
  if (sanitised === null) {
    throw new Error('continuum: invalid tenant identifier');
  }
  const backend = (process.env.CONTINUUM_STORAGE_BACKEND ?? 'hybrid').toLowerCase();
  if (backend === 'sqlite') {
    return new SQLiteStorageBackend(sanitised);
  }
  // hybrid (default) + 'ruvector' alias both → HybridStorageBackend
  return new HybridStorageBackend(sanitised);
}
