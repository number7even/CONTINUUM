/**
 * documents.ts — the PM document layer: templates + the coaching scorer (PM Workspace D2).
 *
 * Two pure capabilities, zero-egress, fully testable:
 *   • TEMPLATES — a starter set of PM document skeletons (PRD, PR-FAQ / Amazon Working
 *     Backwards, TDD, GTM brief, RFC, one-pager, OKRs, user story, incident postmortem,
 *     roadmap). renderTemplate() emits the section scaffold; extensible toward the full 20+.
 *   • scoreDocument() — a deterministic, EXPLAINABLE 0–10 rubric across four dimensions
 *     (Strategy · Structure · Clarity · Completeness) + the top-3 prioritized improvements
 *     with concrete before/after suggestions. Heuristic by design (P4: no hidden LLM call,
 *     no invented score) — the V linesman is the optional deep-score upgrade, layered on top.
 *
 * Documents persist as Observations (type='document') — no new table; CRUD rides the
 * StorageBackend the MCP doc tools already have.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */

export interface DocSection { heading: string; hint: string }
export interface DocTemplate { id: string; name: string; description: string; format: string; sections: DocSection[] }

/** The starter template registry. Each is a proven PM shape; sections carry authoring hints. */
export const TEMPLATES: DocTemplate[] = [
  { id: 'prd', name: 'Product Requirements Document', description: 'What to build and why.', format: 'sectioned', sections: [
    { heading: 'Problem', hint: 'The specific pain, for a specific user. Evidence, not assertion.' },
    { heading: 'Users & Personas', hint: 'Who, in their words. Jobs-to-be-done.' },
    { heading: 'Goals & Non-Goals', hint: 'What this does — and explicitly does NOT — do.' },
    { heading: 'Requirements', hint: 'Functional + non-functional. Prioritized (must/should/could).' },
    { heading: 'Success Metrics', hint: 'The KPI that proves it worked. A number, a target, a window.' },
    { heading: 'Risks & Mitigations', hint: 'What could go wrong; how you de-risk it.' },
    { heading: 'Rollout Plan', hint: 'Phases, gates, kill-switch.' },
  ] },
  { id: 'pr-faq', name: 'PR FAQ (Amazon Working Backwards)', description: 'Start from the launch, work backwards.', format: 'sectioned', sections: [
    { heading: 'Press Release', hint: 'The future announcement. Customer + benefit in the first line.' },
    { heading: 'Customer Quote', hint: 'A believable customer, in their voice.' },
    { heading: 'FAQ — Customer', hint: 'What a buyer asks: price, value, alternatives.' },
    { heading: 'FAQ — Internal', hint: 'What the team asks: cost, risk, dependencies, why now.' },
  ] },
  { id: 'tdd', name: 'Technical Design Document', description: 'How to build it, defensibly.', format: 'sectioned', sections: [
    { heading: 'Context', hint: 'The system today; the constraint forcing this design.' },
    { heading: 'Goals & Non-Goals', hint: 'Engineering scope boundaries.' },
    { heading: 'Design', hint: 'The chosen approach. Diagrams welcome.' },
    { heading: 'Alternatives Considered', hint: 'What you rejected, and why.' },
    { heading: 'Risks', hint: 'Failure modes, blast radius, unknowns.' },
    { heading: 'Testing Strategy', hint: 'How correctness is proven — the verify-commands.' },
    { heading: 'Rollout', hint: 'Migration, backfill, flags, rollback.' },
  ] },
  { id: 'gtm', name: 'Go-To-Market Brief', description: 'How it reaches and converts the market.', format: 'sectioned', sections: [
    { heading: 'Positioning', hint: 'The one sentence a stranger remembers.' },
    { heading: 'Target Audience', hint: 'Segment, buyer, trigger.' },
    { heading: 'Channels', hint: 'Where they actually are.' },
    { heading: 'Pricing & Packaging', hint: 'The offer and the tiers.' },
    { heading: 'Launch Plan', hint: 'Sequence, owners, dates.' },
    { heading: 'Metrics', hint: 'Reach → qualified → closed.' },
  ] },
  { id: 'rfc', name: 'Request for Comments', description: 'Propose a change, invite dissent.', format: 'sectioned', sections: [
    { heading: 'Summary', hint: 'The proposal in three sentences.' },
    { heading: 'Motivation', hint: 'Why now; the cost of doing nothing.' },
    { heading: 'Proposal', hint: 'The concrete change.' },
    { heading: 'Drawbacks', hint: 'The honest downsides.' },
    { heading: 'Alternatives', hint: 'Other paths and why not.' },
  ] },
  { id: 'one-pager', name: 'One-Pager', description: 'The whole idea on one page.', format: 'sectioned', sections: [
    { heading: 'The Idea', hint: 'One sentence.' },
    { heading: 'Why It Matters', hint: 'The stakes.' },
    { heading: 'The Ask', hint: 'The one decision you need.' },
  ] },
  { id: 'okrs', name: 'OKRs', description: 'Objective + measurable key results.', format: 'sectioned', sections: [
    { heading: 'Objective', hint: 'Qualitative, ambitious, time-bound.' },
    { heading: 'Key Results', hint: '3–5, each a number with a target.' },
    { heading: 'Initiatives', hint: 'The bets that move the KRs.' },
  ] },
  { id: 'user-story', name: 'User Story', description: 'A slice of value from the user’s view.', format: 'sectioned', sections: [
    { heading: 'Story', hint: 'As a <user>, I want <goal>, so that <benefit>.' },
    { heading: 'Acceptance Criteria', hint: 'Given/When/Then — the verify-command in prose.' },
    { heading: 'Out of Scope', hint: 'What this story does not cover.' },
  ] },
  { id: 'postmortem', name: 'Incident Postmortem', description: 'Blameless learning from failure.', format: 'sectioned', sections: [
    { heading: 'Summary', hint: 'What broke, impact, duration.' },
    { heading: 'Timeline', hint: 'Detection → mitigation → resolution, timestamped.' },
    { heading: 'Root Cause', hint: 'The real cause, not the trigger.' },
    { heading: 'Action Items', hint: 'Owned, dated, verifiable.' },
  ] },
  { id: 'roadmap', name: 'Roadmap Brief', description: 'Now / Next / Later, with the why.', format: 'sectioned', sections: [
    { heading: 'Now', hint: 'In flight — committed.' },
    { heading: 'Next', hint: 'Scoped, not started.' },
    { heading: 'Later', hint: 'Directional bets.' },
    { heading: 'Rationale', hint: 'The strategy the sequence serves.' },
  ] },
];

export const listTemplates = (): Array<{ id: string; name: string; description: string; sections: number }> =>
  TEMPLATES.map(t => ({ id: t.id, name: t.name, description: t.description, sections: t.sections.length }));

export const getTemplate = (id: string): DocTemplate | null => TEMPLATES.find(t => t.id === id) ?? null;

/** Render a template into a markdown skeleton. `fields` fills a section by heading (case-insensitive). */
export function renderTemplate(id: string, opts: { title?: string; fields?: Record<string, string> } = {}): string {
  const t = getTemplate(id);
  if (!t) throw new Error(`documents: unknown template "${id}" — see listTemplates()`);
  const fields = Object.fromEntries(Object.entries(opts.fields ?? {}).map(([k, v]) => [k.toLowerCase().trim(), v]));
  const lines = [`# ${opts.title ?? t.name}`, '', `> ${t.name} · ${t.description}`, ''];
  for (const s of t.sections) {
    lines.push(`## ${s.heading}`, '');
    const filled = fields[s.heading.toLowerCase()];
    lines.push(filled ? filled.trim() : `_${s.hint}_`, '');
  }
  return lines.join('\n');
}

// ── The coaching scorer ─────────────────────────────────────────────────────
export interface Improvement { dimension: string; issue: string; suggestion: string; before?: string; after?: string }
export interface DocScore {
  strategy: number; structure: number; clarity: number; completeness: number; overall: number;
  docType: string | null; improvements: Improvement[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(10, n));
const headingsOf = (text: string): string[] => [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => (m[1] ?? '').trim().toLowerCase());
const sectionBodies = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const parts = text.split(/^#{1,3}\s+(.+)$/gm);
  for (let i = 1; i < parts.length; i += 2) out[(parts[i] ?? '').trim().toLowerCase()] = (parts[i + 1] ?? '').trim();
  return out;
};

/** Deterministic multi-dimensional score (0–10 each) + top-3 prioritized improvements. Pure. */
export function scoreDocument(text: string, docTypeId?: string): DocScore {
  const t = docTypeId ? getTemplate(docTypeId) : null;
  const words = (text.match(/\b[\w'-]+\b/g) ?? []).length;
  const sentences = (text.match(/[.!?]+(\s|$)/g) ?? []).length || 1;
  const bodies = sectionBodies(text);
  const heads = new Set(headingsOf(text));
  const improvements: Improvement[] = [];

  // STRUCTURE — required sections present (template) OR any headed structure at all.
  let structure: number;
  if (t) {
    const present = t.sections.filter(s => heads.has(s.heading.toLowerCase()));
    structure = clamp((present.length / t.sections.length) * 10);
    for (const s of t.sections) if (!heads.has(s.heading.toLowerCase())) {
      improvements.push({ dimension: 'structure', issue: `Missing the "${s.heading}" section`, suggestion: s.hint, after: `## ${s.heading}\n${s.hint}` });
    }
  } else {
    structure = clamp(heads.size >= 3 ? 8 : heads.size * 2.5);
    if (heads.size < 3) improvements.push({ dimension: 'structure', issue: 'Few or no section headings', suggestion: 'Break the doc into clear ## sections so an agent can load one at a time.' });
  }

  // COMPLETENESS — sections filled with real content (not just a hint/placeholder), and enough of it.
  const requiredHeads = t ? t.sections.map(s => s.heading.toLowerCase()) : [...heads];
  const filled = requiredHeads.filter(h => { const b = bodies[h] ?? ''; return b.length > 30 && !/^_.*_$/.test(b); });
  const completeness = clamp(requiredHeads.length ? (filled.length / requiredHeads.length) * 10 : (words > 120 ? 6 : 3));
  for (const h of requiredHeads) {
    const b = bodies[h] ?? '';
    if (heads.has(h) && (b.length <= 30 || /^_.*_$/.test(b))) improvements.push({ dimension: 'completeness', issue: `"${h}" is a placeholder / near-empty`, suggestion: 'Replace the hint with real, specific content.', before: b.slice(0, 60) });
  }

  // CLARITY — readability: sentence length + concrete vs vague/hedge markers.
  const avgSentence = words / sentences;
  const vague = (text.match(/\b(various|several|robust|leverage|synergy|holistic|world-class|cutting-edge|seamless|innovative|scalable|next-gen)\b/gi) ?? []).length;
  const hedges = (text.match(/\b(might|maybe|possibly|could potentially|we think|hopefully|sort of|kind of)\b/gi) ?? []).length;
  let clarity = 10;
  if (avgSentence > 28) clarity -= Math.min(4, (avgSentence - 28) / 4);
  clarity -= Math.min(3, vague * 0.6);
  clarity -= Math.min(2, hedges * 0.5);
  clarity = clamp(clarity);
  if (avgSentence > 28) improvements.push({ dimension: 'clarity', issue: `Long sentences (avg ${Math.round(avgSentence)} words)`, suggestion: 'Split into shorter sentences; one idea each.' });
  if (vague >= 2) improvements.push({ dimension: 'clarity', issue: `${vague} vague buzzword(s)`, suggestion: 'Replace "leverage/robust/world-class" with the concrete specific.', before: 'a robust, world-class, scalable solution', after: 'handles 10k requests/sec on one node' });

  // STRATEGY — presence of strategic signals: problem, user, metric/number, differentiation, risk.
  const signals = {
    problem: /\bproblem|pain|why now|cost of\b/i.test(text),
    user: /\buser|customer|persona|buyer|audience\b/i.test(text),
    metric: /\d/.test(text) && /\b(metric|kpi|target|%|percent|rate|per\b|goal)\b/i.test(text),
    differentiation: /\b(unlike|differen|competitor|alternative|moat|vs\.?)\b/i.test(text),
    risk: /\brisk|mitigat|fail|drawback|trade-?off\b/i.test(text),
  };
  const stratHits = Object.values(signals).filter(Boolean).length;
  const strategy = clamp((stratHits / 5) * 10);
  for (const [k, v] of Object.entries(signals)) if (!v) improvements.push({ dimension: 'strategy', issue: `No clear ${k} signal`, suggestion: `Add the ${k}: ${({ problem: 'the specific pain + evidence', user: 'who it is for, in their words', metric: 'a measurable success number', differentiation: 'why this beats the alternative', risk: 'the top risk and its mitigation' } as Record<string, string>)[k]}` });

  const overall = round1((strategy * 0.3 + structure * 0.2 + clarity * 0.2 + completeness * 0.3));
  // Top-3 prioritized: lowest-scoring dimensions first, then the improvements that serve them.
  const dimScore: Record<string, number> = { strategy, structure, clarity, completeness };
  const ranked = improvements
    .sort((a, b) => (dimScore[a.dimension] ?? 5) - (dimScore[b.dimension] ?? 5))
    .slice(0, 3);

  return { strategy: round1(strategy), structure: round1(structure), clarity: round1(clarity), completeness: round1(completeness), overall, docType: t?.id ?? null, improvements: ranked };
}
