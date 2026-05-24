/**
 * openStorage() factory — single entry point for choosing the V0 vs V0.5
 * storage backend at runtime.
 *
 *   CONTINUUM_STORAGE_BACKEND=sqlite   (default) → SQLiteStorageBackend
 *   CONTINUUM_STORAGE_BACKEND=hybrid           → HybridStorageBackend
 *   CONTINUUM_STORAGE_BACKEND=ruvector         → HybridStorageBackend (alias)
 *
 * The hybrid backend's heavy deps (ruvector native bindings,
 * @xenova/transformers ONNX runtime) are LAZY-LOADED inside the class —
 * importing this factory does not pull them. Consumers that stay on
 * sqlite pay no extra cost.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { StorageBackend } from './storage.js';
import { SQLiteStorageBackend } from './storage-sqlite.js';
import { HybridStorageBackend } from './storage-hybrid.js';

export function openStorage(projectId: string): StorageBackend {
  const backend = (process.env.CONTINUUM_STORAGE_BACKEND ?? 'sqlite').toLowerCase();
  if (backend === 'hybrid' || backend === 'ruvector') {
    return new HybridStorageBackend(projectId);
  }
  return new SQLiteStorageBackend(projectId);
}
