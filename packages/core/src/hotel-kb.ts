/**
 * hotel-kb — the domain knowledge adapter for a hotel/hospitality tenant (Directive 1).
 *
 * Ingests a tenant's PMS/property data, FAQs, and policies and turns each record into a CANONICAL
 * CONTINUUM Observation, written through `storage.upsertObservation()` — the single privacy
 * choke-point. That means every record is deep-scrubbed (with CONTINUUM_PRIVACY_PII=1, guest
 * email/phone/card/passport/IBAN are redacted) BEFORE it is embedded into the tenant's RuVector
 * collection. This is why CONTINUUM must OWN ingestion: a KB the tenant wrote to directly would
 * embed raw guest PII and carry no provenance. Here, every fact is observed-at-creation, cited by
 * a stable Observation ID, and privacy-filtered by construction.
 *
 * The storage handed in is already tenant-scoped (openStorage(tenantId)) — this module never sees
 * a tenant id, so it cannot cross tenants. Stable IDs (sha256 of kind:key) make re-ingest
 * idempotent: refreshing the KB upserts in place instead of duplicating.
 *
 * Lives in core (like documents.ts / okf-export.ts / state-md.ts) — a pure record→Observation
 * transform belongs next to the storage + privacy filter it depends on, keeping the choke-point
 * guarantee airtight. A standalone CLI/bin wrapper is a thin follow-up if one is needed.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import type { StorageBackend } from './storage.js';

export interface HotelRoom {
  code: string;
  name: string;
  description?: string;
  rateNightly?: number | string;
  maxOccupancy?: number;
  amenities?: string[];
}
export interface HotelFaq { question: string; answer: string }
export interface HotelPolicy { name: string; body: string }
export interface HotelProperty {
  name: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
  phone?: string;
  description?: string;
}
export interface HotelKb {
  property?: HotelProperty;
  rooms?: HotelRoom[];
  faqs?: HotelFaq[];
  policies?: HotelPolicy[];
}

export interface HotelKbIngestResult {
  /** Records written (privacy-filtered) into the tenant's index. */
  upserted: number;
  /** Records the privacy filter rejected outright (all-private content). */
  dropped: number;
  byKind: Record<string, number>;
  ids: string[];
}

const SOURCE_ID = 'hotel-kb';

/** Stable, deterministic Observation ID from a record's kind + natural key (UUID-shaped). */
function stableId(kind: string, key: string): string {
  const hex = createHash('sha256').update(`${kind}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Ingest a hotel KB into an already-tenant-scoped storage backend. Every record flows through
 * upsertObservation → the privacy filter → the embedder. Returns the write tally; records the
 * filter drops (returns null) are counted in `dropped`, never silently lost.
 */
export function ingestHotelKb(storage: StorageBackend, kb: HotelKb, opts: { now?: string } = {}): HotelKbIngestResult {
  const now = opts.now ?? new Date().toISOString();
  storage.upsertSource(SOURCE_ID, 'docs', { adapter: 'hotel-kb' });

  const byKind: Record<string, number> = {};
  const ids: string[] = [];
  let upserted = 0;
  let dropped = 0;

  const put = (kind: string, key: string, type: string, content: string, metadata: Record<string, unknown>, refs: string[] = []): string | null => {
    const id = stableId(kind, key);
    const saved = storage.upsertObservation({ id, sourceId: SOURCE_ID, type, content, timestamp: now, refs, metadata: { kind, ...metadata } });
    if (saved) { upserted++; byKind[kind] = (byKind[kind] ?? 0) + 1; ids.push(id); return id; }
    dropped++;
    return null;
  };

  // Property first — rooms/faqs/policies ref it, forming the provenance graph.
  let propertyId: string | null = null;
  const p = kb.property;
  if (p?.name) {
    const content = [
      p.name,
      p.description,
      p.address && `Address: ${p.address}.`,
      (p.checkIn || p.checkOut) && `Check-in ${p.checkIn ?? '?'}, check-out ${p.checkOut ?? '?'}.`,
      p.phone && `Phone: ${p.phone}.`,
    ].filter(Boolean).join('\n');
    propertyId = put('property', p.name, 'pms_property', content, { name: p.name });
  }
  const propRefs = propertyId ? [propertyId] : [];

  for (const r of kb.rooms ?? []) {
    const content = [
      `Room ${r.name} (${r.code}).`,
      r.description,
      r.rateNightly != null && `Nightly rate: ${r.rateNightly}.`,
      r.maxOccupancy != null && `Sleeps ${r.maxOccupancy}.`,
      r.amenities?.length && `Amenities: ${r.amenities.join(', ')}.`,
    ].filter(Boolean).join(' ');
    put('room', r.code, 'pms_room', content, { code: r.code, rateNightly: r.rateNightly ?? null, maxOccupancy: r.maxOccupancy ?? null }, propRefs);
  }
  for (const f of kb.faqs ?? []) {
    if (!f.question?.trim()) continue;
    put('faq', f.question, 'faq', `Q: ${f.question}\nA: ${f.answer ?? ''}`, {}, propRefs);
  }
  for (const pol of kb.policies ?? []) {
    if (!pol.name?.trim()) continue;
    put('policy', pol.name, 'policy', `${pol.name}\n${pol.body ?? ''}`, { name: pol.name }, propRefs);
  }

  return { upserted, dropped, byKind, ids };
}
