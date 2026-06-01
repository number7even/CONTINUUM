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

export function openStorage(projectId: string): StorageBackend {
  const backend = (process.env.CONTINUUM_STORAGE_BACKEND ?? 'hybrid').toLowerCase();
  if (backend === 'sqlite') {
    return new SQLiteStorageBackend(projectId);
  }
  // hybrid (default) + 'ruvector' alias both → HybridStorageBackend
  return new HybridStorageBackend(projectId);
}
