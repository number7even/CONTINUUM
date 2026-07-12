/**
 * odometer.mjs — the honest per-run odometer. The cure for AMF's silent-over-claiming
 * disease: instead of each stage quietly gating (skipping a provider with no key, dropping
 * to a template, routing a lead nowhere), this surfaces EVERY gate in one loud place, with
 * exactly what it means and how to unblock it.
 *
 * Reads the REAL gates from source — never re-derives them:
 *   • providers      → each provider's own gate() in adapter-news.mjs (single source of truth)
 *   • capabilities   → the env keys that gate LLM drafting, XENOS leads/HITL, VAULT talent
 *   • lead routing   → xenos-registry.json owner_tenant_id NULLs (the silent lead-loss root)
 *
 *   node odometer.mjs            → the loud capability report
 *   node odometer.mjs --json     → machine-readable
 *
 * RunReport is the per-run tally (ingested · matched · drafted · routed) the pipeline
 * populates and prints at the end of a chain — honest counts, never faked.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import './env.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS } from './adapter-news.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const set = (k) => !!(process.env[k] && String(process.env[k]).trim());

/**
 * The capability report — every gate in the system, resolved from source, LOUD.
 * @returns {{providers: Array, providersLive: number, providersTotal: number,
 *            capabilities: Array, tenants: {filled:number,total:number,missing:string[]}}}
 */
export function capabilityReport() {
  // Providers — read each provider's OWN gate() (do not duplicate the env checks).
  const providers = Object.entries(PROVIDERS).map(([id, p]) => {
    const reason = typeof p.gate === 'function' ? p.gate() : null;
    return { id, live: reason == null, fix: reason };
  });

  // Env-gated capabilities — each with what "gated" actually costs + the fix.
  const capabilities = [
    { name: 'LLM drafting', live: set('ANTHROPIC_API_KEY'), cost: 'drafts are template-grade, not brand-authored', fix: 'set ANTHROPIC_API_KEY' },
    { name: 'Lead routing (XENOS Seam ①)', live: set('XENOS_LEADS_KEY') && set('XENOS_LEADS_URL'), cost: 'approved leads route NOWHERE — silently', fix: 'set XENOS_LEADS_KEY + XENOS_LEADS_URL' },
    { name: 'HITL feedback (XENOS Seam ②)', live: set('XENOS_HITL_KEY'), cost: 'the learning loop gets no fuel', fix: 'set XENOS_HITL_KEY + expose GET /api/hitl/recent-decisions' },
    { name: 'VAULT rented talent', live: set('STUDIOMUNICH_VAULT_SECRET'), cost: 'rented faces decline → synthetic only', fix: 'set STUDIOMUNICH_VAULT_SECRET (+ playbook)' },
  ];

  // XENOS owner-tenant UUIDs — the silent lead-loss root cause.
  const tenants = { filled: 0, total: 0, missing: [] };
  try {
    const reg = JSON.parse(readFileSync(resolve(HERE, 'xenos-registry.json'), 'utf8'));
    for (const [slug, v] of Object.entries(reg.map || {})) {
      tenants.total += 1;
      if (v.owner_tenant_id) tenants.filled += 1;
      else tenants.missing.push(slug);
    }
  } catch { /* registry absent — reported as 0/0 */ }

  return {
    providers,
    providersLive: providers.filter((p) => p.live).length,
    providersTotal: providers.length,
    capabilities,
    tenants,
  };
}

const c = {
  b: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`,
  grn: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, ylw: (s) => `\x1b[33m${s}\x1b[0m`,
};

/** Loud, human-facing render — nothing hidden. */
export function renderCapability(rep) {
  const L = [c.b('AMF · HONEST ODOMETER') + c.dim('   every gate, loud — no silent drops (P4)'), ''];

  L.push(c.b('INGEST') + `   ${rep.providersLive}/${rep.providersTotal} providers live`);
  for (const p of rep.providers) {
    L.push(p.live ? `   ${c.grn('● live ')} ${p.id}` : `   ${c.red('○ GATED')} ${p.id} ${c.dim('— ' + p.fix)}`);
  }
  L.push('');

  L.push(c.b('CAPABILITIES'));
  for (const cap of rep.capabilities) {
    L.push(cap.live
      ? `   ${c.grn('● live ')} ${cap.name}`
      : `   ${c.red('○ GATED')} ${cap.name} ${c.dim('→ ' + cap.cost + '  ·  fix: ' + cap.fix)}`);
  }
  L.push('');

  const t = rep.tenants;
  const ok = t.total > 0 && t.filled === t.total;
  L.push(c.b('LEAD ROUTING') + '   ' + (ok
    ? c.grn(`${t.filled}/${t.total} owner tenant UUIDs`)
    : c.red(`${t.filled}/${t.total} owner tenant UUIDs`) + c.dim(` — leads for ${t.missing.length} product(s) VANISH silently`)));
  if (t.missing.length) L.push(c.dim('   missing: ' + t.missing.join(', ')));

  return L.join('\n') + '\n';
}

/** Per-run tally the pipeline fills in — honest counts, never faked (unknown = null, said so). */
export class RunReport {
  constructor(label = 'run') {
    this.label = label;
    this.ingested = null; this.providersGated = [];
    this.matchedKept = null; this.matchedTotal = null;
    this.drafted = null; this.draftMode = null;
    this.routed = null; this.routeGated = null;
    this.notes = [];
  }
  render() {
    const f = (v) => (v == null ? '?' : v);
    return `[odometer:${this.label}] ` + [
      `ingested ${f(this.ingested)}${this.providersGated.length ? ` (${this.providersGated.length} gated)` : ''}`,
      `matched ${f(this.matchedKept)}/${f(this.matchedTotal)}`,
      `drafted ${f(this.drafted)}${this.draftMode ? ` (${this.draftMode})` : ''}`,
      `routed ${f(this.routed)}${this.routeGated ? ` (GATED: ${this.routeGated})` : ''}`,
    ].join(' · ');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rep = capabilityReport();
  if (process.argv.includes('--json')) console.log(JSON.stringify(rep, null, 2));
  else process.stdout.write(renderCapability(rep));
  process.exit(0);
}
