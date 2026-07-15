#!/usr/bin/env node
/**
 * calendar.mjs — the 30-Day Walk-and-Talk Calendar Generator (Content OS, Slice 2).
 *
 * Maps the brand's REAL demand intelligence into the ratified 30-day cadence:
 *   intelligence  = the Demand Atlas CORE terms (demand-scored) + the packet's topic graph
 *   cadence       = the 30-day rotation (insight / proof / opinion / teardown / weekly recap),
 *                   each day carrying a topic + a walk-and-talk hook + BOTH brand angles
 *   ledger weld   = every day lands as a CONTINUUM todo (idempotent) on the commit-linked
 *                   board — subject to the full A→V→T→H discipline before anything publishes
 *
 * The personal and company profiles SHARE one topic graph but differ in framing (the
 * "two voice profiles, one topic graph" design choice — prevents repetition while
 * preserving strategic consistency).
 *
 * MECHANICAL SELF-GATE (exits 1 unless): 30 days mapped · every day has topic + hook +
 * both angles · no topic repeats within any 7-day cluster.
 *
 *   node calendar.mjs --brand voicecosmos --profile company [--start 2026-08-01]
 *                     [--project graph-demo] [--dry] [--atlas <path>]
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import './env.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStorage } from '@number7even/continuum-core';
import { brandIdentity } from './brand-tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');

// ── The ratified 30-day cadence (theme · personal angle · company angle · hook · format) ──
export const CADENCE = [
  { d: 1,  theme: 'Market trend scan',      personal: 'What changed this week?',            company: 'Why it matters for the category',   hook: "Here's the one shift everyone will miss.",              format: 'insight'  },
  { d: 2,  theme: 'Customer pain point',    personal: 'Founder lesson',                     company: 'Problem the product solves',        hook: 'This is the real bottleneck I keep seeing.',            format: 'proof'    },
  { d: 3,  theme: 'Workflow inefficiency',  personal: 'Operator insight',                   company: 'Workflow automation value',         hook: 'Most teams are still doing this manually.',             format: 'teardown' },
  { d: 4,  theme: 'Industry benchmark',     personal: 'Contrarian view',                    company: 'How your approach differs',         hook: 'The benchmark is misleading for this use case.',        format: 'opinion'  },
  { d: 5,  theme: 'Founder opinion',        personal: 'Strong point of view',               company: 'Category positioning',              hook: 'I think the market is optimizing the wrong metric.',    format: 'opinion'  },
  { d: 6,  theme: 'Use case teardown',      personal: 'Real-world story',                   company: 'Product-led proof',                 hook: "Here's how this breaks down in practice.",              format: 'teardown' },
  { d: 7,  theme: 'Weekly recap',           personal: 'Personal reflection',                company: 'Company learning summary',          hook: "Three things I'd carry into next week.",                format: 'recap'    },
  { d: 8,  theme: 'Emerging tech',          personal: 'Curiosity and analysis',             company: 'Strategic relevance',               hook: 'This model changes the economics of content.',          format: 'insight'  },
  { d: 9,  theme: 'Buyer objection',        personal: 'Sales insight',                      company: 'Objection handling',                hook: "Here's the objection I hear before every deal.",        format: 'proof'    },
  { d: 10, theme: 'Regulation/compliance',  personal: 'Trust and risk lens',                company: 'Governance capability',             hook: 'Compliance is becoming a product feature.',             format: 'insight'  },
  { d: 11, theme: 'Operational playbook',   personal: 'Tactical credibility',               company: 'Repeatable system',                 hook: "This is the workflow I'd standardize first.",           format: 'teardown' },
  { d: 12, theme: 'Customer success story', personal: 'Human story',                        company: 'Measurable outcome',                hook: 'This is what changed after rollout.',                   format: 'proof'    },
  { d: 13, theme: 'Competitive gap',        personal: 'Analytical edge',                    company: 'Differentiation message',           hook: "Here's where the category still falls short.",          format: 'opinion'  },
  { d: 14, theme: 'Weekly recap',           personal: 'Founder POV',                        company: 'Market synthesis',                  hook: 'The pattern is clearer than it looks.',                 format: 'recap'    },
  { d: 15, theme: 'Vertical deep dive',     personal: 'Expert framing',                     company: 'Industry fit',                      hook: "Let's go one level deeper into this vertical.",         format: 'insight'  },
  { d: 16, theme: 'AI workflow trend',      personal: 'Technical viewpoint',                company: 'Platform leverage',                 hook: 'The bottleneck is no longer generation.',               format: 'insight'  },
  { d: 17, theme: 'Data or metric insight', personal: 'Credibility through evidence',       company: 'KPI alignment',                     hook: 'One metric explains a lot of the behavior.',            format: 'proof'    },
  { d: 18, theme: 'Product philosophy',     personal: 'Visionary framing',                  company: 'Product strategy',                  hook: 'What we refuse to automate matters.',                   format: 'opinion'  },
  { d: 19, theme: 'Team/process lesson',    personal: 'Leadership voice',                   company: 'Scale readiness',                   hook: 'This is where teams start to break.',                   format: 'teardown' },
  { d: 20, theme: 'Customer journey',       personal: 'Empathy and clarity',                company: 'Conversion narrative',              hook: 'The journey is shorter than most assume.',              format: 'proof'    },
  { d: 21, theme: 'Weekly recap',           personal: 'Personal and company synthesis',     company: 'What is working',                   hook: "These are the three signals I'd trust.",                format: 'recap'    },
  { d: 22, theme: 'Category narrative',     personal: 'POV on the future',                  company: 'Thought leadership',                hook: 'The market narrative is about to shift.',               format: 'opinion'  },
  { d: 23, theme: 'Tooling stack',          personal: 'Builder credibility',                company: 'Architecture preference',           hook: "This is the stack I'd choose today.",                   format: 'teardown' },
  { d: 24, theme: 'Case study pattern',     personal: 'Storytelling',                       company: 'Proof of value',                    hook: 'The same pattern keeps showing up.',                    format: 'proof'    },
  { d: 25, theme: 'Objection teardown',     personal: 'Sales clarity',                      company: 'Response framework',                hook: "Here's the answer to the hardest objection.",           format: 'teardown' },
  { d: 26, theme: 'Ecosystem trend',        personal: 'Strategic perspective',              company: 'Partnership potential',             hook: 'The ecosystem is consolidating around this.',           format: 'insight'  },
  { d: 27, theme: 'Decision framework',     personal: 'Practical authority',                company: 'Buyer enablement',                  hook: 'Use this framework before making the call.',            format: 'teardown' },
  { d: 28, theme: 'Weekly recap',           personal: 'Executive summary',                  company: 'Narrative continuity',              hook: "What I'd prioritize if I started again.",               format: 'recap'    },
  { d: 29, theme: 'Big idea synthesis',     personal: 'Founder thesis',                     company: 'Brand positioning',                 hook: "This is the core thesis I'd repeat everywhere.",        format: 'opinion'  },
  { d: 30, theme: 'Month-end reflection',   personal: 'Authentic reflection',               company: 'Company roadmap link',              hook: 'What this month taught me about the market.',           format: 'recap'    },
];

/** Parse a brand's demand-scored CORE terms from the Demand Atlas. [{term, score}] */
export function parseAtlasCore(atlasText, slug) {
  const section = atlasText.split(new RegExp(`#{4,}\\s*${slug}\\s*#{4,}`))[1]?.split(/#{4,}/)[0] ?? '';
  const core = section.split('● CORE')[1]?.split('●')[0] ?? '';
  const terms = [];
  for (const m of core.matchAll(/^\s*([\d.]+)\s+(.+?)\s{2,}\[/gm)) terms.push({ score: +m[1], term: m[2].trim() });
  return terms.sort((a, b) => b.score - a.score);
}

/** Build the topic pool: Atlas CORE (demand-ranked) first, packet topics appended (deduped). */
export function topicPool(atlasTerms, packetTopics) {
  const seen = new Set();
  const pool = [];
  for (const t of atlasTerms) if (!seen.has(t.term.toLowerCase())) { seen.add(t.term.toLowerCase()); pool.push(t.term); }
  for (const t of packetTopics ?? []) if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); pool.push(t); }
  return pool;
}

/** Assign topics to the 30-day cadence: round-robin over the demand-ranked pool; recap days
 *  synthesize their week (topic = "week N synthesis: <the week's lead topic>"). Guarantees no
 *  topic repeats within any 7-day cluster (pool permitting). */
export function buildCalendar({ brand, profile, start, pool }) {
  if (pool.length < 6) throw new Error(`calendar: topic pool too thin (${pool.length}) — run analyze/ingest first`);
  const startDate = new Date(start + 'T00:00:00Z');
  const days = [];
  let p = 0;
  for (const c of CADENCE) {
    const date = new Date(startDate.getTime() + (c.d - 1) * 86400000).toISOString().slice(0, 10);
    let topic;
    if (c.format === 'recap') {
      const week = Math.ceil(c.d / 7);
      const weekDays = days.filter(x => Math.ceil(x.day / 7) === week && x.format !== 'recap');
      topic = `week ${week} synthesis: ${weekDays[0]?.topic ?? pool[0]}`;
    } else {
      topic = pool[p % pool.length];
      p++;
    }
    days.push({
      day: c.d, date, theme: c.theme, format: c.format, topic,
      hook: c.hook,
      personal_angle: c.personal, company_angle: c.company,
      angle: profile === 'personal' ? c.personal : c.company,
      brand, profile,
    });
  }
  return days;
}

/** The mechanical self-gate (the directive): 30 days · topic+hook+both angles on every day ·
 *  no topic repeated within any 7-day cluster. Returns issues[]; empty = green. */
export function gateCalendar(days) {
  const issues = [];
  if (days.length !== 30) issues.push(`days=${days.length} ≠ 30`);
  for (const d of days) {
    for (const f of ['topic', 'hook', 'personal_angle', 'company_angle']) {
      if (!d[f] || !String(d[f]).trim()) issues.push(`day ${d.day}: missing ${f}`);
    }
  }
  for (let w = 1; w <= 5; w++) {
    const cluster = days.filter(d => Math.ceil(d.day / 7) === w && d.format !== 'recap');
    const topics = cluster.map(d => d.topic.toLowerCase());
    if (new Set(topics).size !== topics.length) issues.push(`week ${w}: topic repeats within the cluster`);
  }
  return issues;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
  const brand = arg('--brand', null);
  const profile = arg('--profile', 'company');
  const start = arg('--start', new Date().toISOString().slice(0, 10));
  const project = arg('--project', process.env.CONTINUUM_PROJECT_ID || 'graph-demo');
  const atlasPath = arg('--atlas', join(REPO, 'docs', 'DEMAND_ATLAS_2026-07-01.md'));
  const dry = process.argv.includes('--dry');
  if (!brand || !['company', 'personal'].includes(profile)) {
    console.error('usage: node calendar.mjs --brand <slug> --profile company|personal [--start YYYY-MM-DD] [--project <id>] [--dry]');
    process.exit(2);
  }

  // Intelligence pull — the packet (refuses non-onboarded brands: uniqueness law) + the Atlas.
  const packet = brandIdentity(brand);                                   // throws if not onboarded
  const uni = JSON.parse(readFileSync(join(HERE, 'portfolio-universe.json'), 'utf8'));
  const product = uni.products.find(x => x.slug === brand);
  const atlas = existsSync(atlasPath) ? readFileSync(atlasPath, 'utf8') : '';
  const core = parseAtlasCore(atlas, brand);
  const pool = topicPool(core, product.topics);
  console.log(`[calendar] ${brand}/${profile} · demand terms ${core.length} (atlas) + topics ${product.topics?.length ?? 0} (packet) → pool ${pool.length}`);

  const days = buildCalendar({ brand, profile, start, pool });

  // THE MECHANICAL SELF-GATE — exit 1 unless green (the directive).
  const issues = gateCalendar(days);
  if (issues.length) { console.error('CALENDAR_GATE: RED'); issues.forEach(i => console.error('  ✗ ' + i)); process.exit(1); }
  console.log('[calendar] self-gate GREEN — 30 days · topic+hook+both angles · no cluster repeats');

  // Artifacts: the full plan on disk (json + human-readable md).
  mkdirSync(join(HERE, 'out'), { recursive: true });
  const base = join(HERE, 'out', `calendar-${brand}-${profile}-${start}`);
  writeFileSync(base + '.json', JSON.stringify({ brand, profile, start, generatedFrom: { atlasTerms: core.length, packetTopics: product.topics?.length ?? 0 }, days }, null, 2));
  writeFileSync(base + '.md', [
    `# 30-Day Walk-and-Talk Calendar — ${brand} (${profile}) · start ${start}`, '',
    '| Day | Date | Theme | Format | Topic | Hook |', '|---|---|---|---|---|---|',
    ...days.map(d => `| ${d.day} | ${d.date} | ${d.theme} | ${d.format} | ${d.topic} | ${d.hook} |`),
  ].join('\n'));
  console.log(`[calendar] artifacts → ${base}.{json,md}`);

  // Ledger weld — every day lands as a CONTINUUM todo on the board (idempotent by ref).
  if (dry) { console.log('[calendar] --dry: skipping the ledger weld'); process.exit(0); }
  const storage = await openStorage(project);
  const existing = new Map();
  for (const t of storage.listTodos()) for (const r of t.refs ?? []) if (r.startsWith('calendar:')) existing.set(r, t);
  let created = 0;
  for (const d of days) {
    const ref = `calendar:${brand}:${profile}:${start}:d${String(d.day).padStart(2, '0')}`;
    if (existing.has(ref)) continue;
    storage.createTodo({
      title: `📅 ${brand} W&T d${String(d.day).padStart(2, '0')} · ${d.theme} — ${d.topic} · "${d.hook}"`,
      status: 'open',
      refs: [ref],
    });
    created++;
  }
  console.log(`[calendar] ledger weld → project "${project}": ${created} todo(s) created, ${30 - created} already present (idempotent)`);
  console.log(`P9: each day crosses the board's A→V→T→H gate before anything publishes.`);
}
