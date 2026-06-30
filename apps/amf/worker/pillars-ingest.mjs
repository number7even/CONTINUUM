/**
 * pillars-ingest.mjs — ingest the PORTFOLIO ONTOLOGY (your products) into CONTINUUM.
 *
 * Writes one type='pillar' Observation per portfolio brand into the `pillars` project,
 * so the content-matcher can DERIVE each product's pillar terms (instead of hand-typing
 * --pillars). Each pillar = name + tagline (extracted from the live site) + a curated
 * domain line for the products whose positioning is VERIFIED this session/CLAUDE.md.
 *
 * HONEST (P4): products with verified positioning get a rich pillar; the rest get
 * name + tagline ONLY (flagged source='tagline') — enrich later by ingesting the
 * product repo/site via the docs/git adapters. No fabricated domains.
 *
 *   node pillars-ingest.mjs            # → ~/.continuum/pillars
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const BB = join(HERE, 'brandbooks');
process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';

export function pillarId(slug) {
  const h = createHash('sha256').update(`pillar:${slug}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Verified positioning (this session + CLAUDE.md). Only products I can stand behind (P4).
const KNOWN = {
  voicecosmos: 'AI voice operating system for hospitality, hotels, spas, salons; booking recovery, after-hours calls, no-show reduction, guest experience, concierge, ARIAN, revenue leaks',
  voiceidvault: 'voice biometric security, voice authentication, biometric identity, fraud prevention, deepfake detection, enterprise access control',
  podgeni: 'podcasting, AI guest interviewer, co-host, content creation, research grounding, advisory marketplace, RAWPITCH',
  studiomunich: 'digital talent licensing marketplace, consented avatars, faces and voices, likeness rights, royalties, media production, rent an avatar',
  continuum: 'persistent AI memory, agent context, verifiable state, verify-then-dissolve, autonomous media factory, content engine',
  thenine: 'verifiable trust, AI governance, safety, ethics, accountability, agent discipline',
  sezine: 'workforce intelligence, talent intelligence, hiring, recruitment, HR, skills, people analytics',
  viwago: 'compliance, security, governance platform, audit, risk, regulatory',
};

function main() {
  const slugs = readdirSync(BB).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  // openStorage via the built core
  return import(resolve(REPO_ROOT, 'packages/core/dist/index.js')).then(({ openStorage }) => {
    const storage = openStorage('pillars');
    storage.upsertSource('portfolio', 'docs', { adapter: 'pillars' });
    const now = new Date().toISOString();
    let rich = 0, thin = 0;
    for (const slug of slugs) {
      const b = JSON.parse(readFileSync(join(BB, `${slug}.json`), 'utf8'));
      const tagline = b.tagline && b.tagline !== 'UNKNOWN' ? b.tagline : '';
      const known = KNOWN[slug];
      const content = [b.name, tagline, known].filter(Boolean).join('. ');
      const src = known ? 'curated+tagline' : 'tagline-only';
      storage.upsertObservation({ id: pillarId(slug), sourceId: 'portfolio', type: 'pillar', content, timestamp: now, refs: [], metadata: { brand: slug, name: b.name, source: src } });
      known ? rich++ : thin++;
      console.error(`  ${known ? '●' : '○'} ${slug.padEnd(16)} ${src.padEnd(16)} ${content.slice(0, 64)}`);
    }
    console.error(`\n✅ ${slugs.length} pillars → "pillars" (${rich} rich, ${thin} tagline-only). Derive in content-matcher via --brand.`);
    storage.close();
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
