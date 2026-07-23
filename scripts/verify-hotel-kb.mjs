#!/usr/bin/env node
// verify-hotel-kb.mjs — proof-gate for the hotel-KB domain adapter (Directive 1).
//
// The promise CONTINUUM sells a hotel tenant: "we build a secure, private semantic memory index of
// your data — every answer grounded in your policies, cited, and PII never leaks." This gate proves
// the ingestion seam delivers exactly that, and that it CANNOT be bypassed:
//   • each record becomes a CANONICAL Observation (pms_property / pms_room / faq / policy);
//   • guest PII (email / phone / card) embedded in the source is REDACTED at upsertObservation —
//     the raw values never reach the stored content that gets embedded;
//   • the knowledge is retrievable by content (FTS5) and carries provenance (rooms ref the property);
//   • re-ingest is idempotent (stable IDs — a KB refresh upserts, never duplicates);
//   • the PII scrub is the SCOPED CONTINUUM_PRIVACY_PII toggle — off, dev-mode content is untouched.
//
//   node scripts/verify-hotel-kb.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-hotelkb-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
process.env.CONTINUUM_PRIVACY_PII = '1';   // SaaS/tenant mode — scrub guest PII

const { openStorage, ingestHotelKb } = await import('@number7even/continuum-core');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

// A fixture with guest PII deliberately embedded in the FAQ + policy text.
const kb = {
  property: { name: 'Grand Harbour Hotel', address: '1 Quay St', checkIn: '15:00', checkOut: '11:00', phone: '+1 415 555 0132', description: 'A boutique waterfront hotel.' },
  rooms: [
    { code: 'DLX', name: 'Deluxe King', description: 'Harbour-view king room.', rateNightly: 320, maxOccupancy: 2, amenities: ['wifi', 'minibar'] },
    { code: 'STE', name: 'Harbour Suite', description: 'Top-floor suite.', rateNightly: 780, maxOccupancy: 4, amenities: ['wifi', 'lounge'] },
  ],
  faqs: [
    { question: 'How do I reach the concierge?', answer: 'Email concierge@grandharbour.com or call +1 415 555 0199 any time.' },
    { question: 'What is the cancellation window?', answer: 'Free cancellation up to 48 hours before arrival.' },
  ],
  policies: [
    { name: 'Cancellation Policy', body: 'Cancel 48h+ ahead for a full refund. Example booking by john.doe@gmail.com on card 4111 1111 1111 1111 is refundable.' },
  ],
};

const storage = await openStorage('hotelkb-test');
const res = ingestHotelKb(storage, kb);

console.log('── Directive 1 · canonical ingestion ───────────────────────────────────');
check('every record ingested (1 property + 2 rooms + 2 faqs + 1 policy = 6)', res.upserted === 6 && res.dropped === 0, `upserted ${res.upserted}, dropped ${res.dropped}`);
const obs = storage.getObservations(res.ids);
const types = new Set(obs.map(o => o.type));
check('records become CANONICAL Observation types', ['pms_property', 'pms_room', 'faq', 'policy'].every(t => types.has(t)), [...types].join(','));

console.log('── the privacy guarantee · PII scrubbed BEFORE it can embed ─────────────');
const allText = obs.map(o => o.content).join('\n');
check('guest email is redacted (not stored raw)', !allText.includes('concierge@grandharbour.com') && !allText.includes('john.doe@gmail.com') && /\[REDACTED:pii-email\]/.test(allText));
check('guest phone is redacted', !allText.includes('415 555 0199') && /\[REDACTED:pii-phone\]/.test(allText));
check('guest card number is redacted', !allText.includes('4111 1111 1111 1111') && /\[REDACTED:pii-credit-card\]/.test(allText));

console.log('── retrieval + provenance ──────────────────────────────────────────────');
const hits = storage.searchObservations('cancellation', 10);
check('knowledge is retrievable by content (FTS5)', hits.some(h => res.ids.includes(h.id)), `${hits.length} hits`);
const room = obs.find(o => o.type === 'pms_room');
const property = obs.find(o => o.type === 'pms_property');
check('a room carries provenance — refs its property Observation', !!room && !!property && room.refs.includes(property.id));
check('metadata is canonical (kind tag present)', obs.every(o => typeof o.metadata?.kind === 'string'));

console.log('── idempotency (a KB refresh upserts, never duplicates) ─────────────────');
const before = storage.searchObservations('hotel', 100).length;
const res2 = ingestHotelKb(storage, kb);
const after = storage.searchObservations('hotel', 100).length;
check('re-ingest returns the same stable IDs', JSON.stringify(res2.ids.sort()) === JSON.stringify(res.ids.slice().sort()));
check('re-ingest does not duplicate observations', after === before, `${before} → ${after}`);

console.log('── the scrub is the SCOPED toggle (dev-mode untouched) ──────────────────');
delete process.env.CONTINUUM_PRIVACY_PII;   // dev / self-host single-tenant default
const devStore = await openStorage('hotelkb-devmode');
const devRes = ingestHotelKb(devStore, { faqs: [{ question: 'devcontact', answer: 'reach the maintainer at dev@example.com' }] });
const devObs = devStore.getObservations(devRes.ids)[0];
check('with PII toggle OFF, an email in content is preserved (no silent change)', devObs.content.includes('dev@example.com'));
process.env.CONTINUUM_PRIVACY_PII = '1';

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('HOTEL_KB_VERIFY: GREEN — tenant knowledge ingests as canonical, provenance-linked Observations;');
  console.log('guest PII is scrubbed at the choke-point before it can embed; retrieval + idempotency hold.');
  process.exit(0);
} else { console.log('HOTEL_KB_VERIFY: RED'); process.exit(1); }
