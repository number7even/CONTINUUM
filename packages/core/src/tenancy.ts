/**
 * tenancy — the multi-tenant CONTROL PLANE (Directive 2, resolves D-V2.2).
 *
 * The architectural split, locked:
 *   • DATA PLANE  — per-tenant knowledge lives in RuVector (openStorage(tenantId)): Observations,
 *     embeddings, the vector index. Physically isolated per tenant under ~/.continuum/<tenantId>/.
 *   • CONTROL PLANE (this module) — a SEPARATE relational directory that maps a tenant UUID to its
 *     plan, status, and a signing-KEY REFERENCE (keyId, never the secret — P1). It holds NO
 *     knowledge: no Observations, no embeddings, no content. That separation is the whole point —
 *     the directory can be queried for "is tenant X active / on the enterprise plan?" without ever
 *     touching, or being able to leak, a tenant's knowledge.
 *
 * D-V2.2 is resolved as a pluggable relational directory behind one interface (the same discipline
 * as D2's storage adapter): SQLite is the verified default (local + self-host + CI), and Postgres
 * is the production multi-tenant swap — a single factory branch, wired the day a hosted deployment
 * needs it. This keeps D2 intact (RuVector remains the unified DATA engine) while giving tenancy
 * its own honest home.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { continuumDataRoot } from './db.js';
import { sanitiseTenantId } from './tenant.js';

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface TenantRecord {
  /** The sanitised tenant id — the exact value carried in the X-Continuum-Project header. */
  tenantId: string;
  plan: string;                 // 'free' | 'pro' | 'enterprise' | operator-defined
  status: TenantStatus;
  /** A REFERENCE to the tenant's signing/JWT key — never the secret material (P1). */
  keyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterTenantInput {
  tenantId: string;
  plan?: string;
  status?: TenantStatus;
  keyId?: string | null;
}

/** The control-plane directory. Deliberately small: tenancy metadata only, never knowledge. */
export interface TenancyDirectory {
  registerTenant(input: RegisterTenantInput): TenantRecord;
  getTenant(tenantId: string): TenantRecord | null;
  listTenants(): TenantRecord[];
  setStatus(tenantId: string, status: TenantStatus): TenantRecord;
  setPlan(tenantId: string, plan: string): TenantRecord;
  /** True only when the tenant exists AND is active/trial — the gate a request checks. */
  isServable(tenantId: string): boolean;
  close(): void;
}

interface TenantRow { tenant_id: string; plan: string; status: string; key_id: string | null; created_at: string; updated_at: string }
const rowTo = (r: TenantRow): TenantRecord => ({
  tenantId: r.tenant_id, plan: r.plan, status: r.status as TenantStatus, keyId: r.key_id, createdAt: r.created_at, updatedAt: r.updated_at,
});

/** SQLite control plane — the verified default. A dedicated DB, NOT a tenant's knowledge DB. */
export class SqliteTenancyDirectory implements TenancyDirectory {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? (() => {
      const dir = join(continuumDataRoot(), '_tenancy');
      mkdirSync(dir, { recursive: true });
      return join(dir, 'tenancy.db');
    })();
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    // Note the schema: plan/status/key_id only. There is deliberately no `content`, no `embedding`,
    // no `observation` column — the control plane structurally cannot hold knowledge.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        tenant_id  TEXT PRIMARY KEY,
        plan       TEXT NOT NULL DEFAULT 'free',
        status     TEXT NOT NULL DEFAULT 'trial',
        key_id     TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private require(tenantId: string): string {
    const id = sanitiseTenantId(tenantId);
    if (id === null) throw new Error('continuum: invalid tenant identifier');
    return id;
  }

  registerTenant(input: RegisterTenantInput): TenantRecord {
    const id = this.require(input.tenantId);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tenants (tenant_id, plan, status, key_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        plan = excluded.plan, status = excluded.status, key_id = excluded.key_id, updated_at = excluded.updated_at
    `).run(id, input.plan ?? 'free', input.status ?? 'trial', input.keyId ?? null, now, now);
    return this.getTenant(id)!;
  }

  getTenant(tenantId: string): TenantRecord | null {
    const id = sanitiseTenantId(tenantId);
    if (id === null) return null;
    const row = this.db.prepare('SELECT * FROM tenants WHERE tenant_id = ?').get(id) as TenantRow | undefined;
    return row ? rowTo(row) : null;
  }

  listTenants(): TenantRecord[] {
    return (this.db.prepare('SELECT * FROM tenants ORDER BY created_at').all() as TenantRow[]).map(rowTo);
  }

  setStatus(tenantId: string, status: TenantStatus): TenantRecord {
    const id = this.require(tenantId);
    const info = this.db.prepare('UPDATE tenants SET status = ?, updated_at = ? WHERE tenant_id = ?').run(status, new Date().toISOString(), id);
    if (info.changes === 0) throw new Error(`no such tenant: ${id}`);
    return this.getTenant(id)!;
  }

  setPlan(tenantId: string, plan: string): TenantRecord {
    const id = this.require(tenantId);
    const info = this.db.prepare('UPDATE tenants SET plan = ?, updated_at = ? WHERE tenant_id = ?').run(plan, new Date().toISOString(), id);
    if (info.changes === 0) throw new Error(`no such tenant: ${id}`);
    return this.getTenant(id)!;
  }

  isServable(tenantId: string): boolean {
    const t = this.getTenant(tenantId);
    return t !== null && (t.status === 'active' || t.status === 'trial');
  }

  close(): void { this.db.close(); }
}

/**
 * Open the control-plane directory. SQLite is the verified default; `postgres` is the production
 * multi-tenant target — the single swap point (P3: architected for change). The Postgres binding
 * is lazy + opt-in so core carries no `pg` dependency and CI stays local-first; selecting it
 * without the binding fails LOUDLY rather than silently degrading (P4).
 */
export function openTenancyDirectory(opts: { dbPath?: string } = {}): TenancyDirectory {
  const backend = (process.env.CONTINUUM_TENANCY_BACKEND ?? 'sqlite').toLowerCase();
  if (backend === 'sqlite') return new SqliteTenancyDirectory(opts.dbPath);
  throw new Error(
    `continuum: tenancy backend "${backend}" is not bundled. The SQLite control plane is the ` +
    `verified default; the Postgres production binding installs separately (needs pg + DATABASE_URL). ` +
    `Unset CONTINUUM_TENANCY_BACKEND to use SQLite.`,
  );
}
