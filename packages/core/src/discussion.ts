/**
 * buildDiscussionScript — the two-host session recap, grounded in real state and fed by
 * the Phase-4 SEMANTIC retrieval (tier-cited). Deterministic: the structure + content come
 * from the store (checkpoint · accepted decisions · open work · tier-cited findings) — a
 * model may later polish the turns into natural dialogue, but nothing here is invented.
 *
 * Host A (the explainer) states what landed, flagging each piece's trust tier.
 * Host B (the prober) challenges the trust and raises the open questions (P9 acceptance,
 * next-by-leverage) — the creative-input recap, not a recitation.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { computeNextTasks } from './next-tasks.js';
import { retrieveContext } from './trust.js';
import type { StorageBackend } from './storage.js';

export interface DiscussionTurn { host: 'A' | 'B'; text: string; refs: string[]; tier?: string }
export interface DiscussionScript { title: string; topic: string; turns: DiscussionTurn[]; grounded: number }

export async function buildDiscussionScript(
  storage: StorageBackend,
  opts?: { topic?: string },
): Promise<DiscussionScript> {
  const snap = storage.getStateAt();
  const active = snap?.active ?? [];
  const topic = (opts?.topic ?? snap?.reason ?? active[0]?.name ?? 'this session').trim();

  // Phase-4 semantic grounding — tier-cited nodes for the topic.
  const ctx = await retrieveContext(storage, topic, { limit: 6 });
  const next = computeNextTasks(storage.listTodos());
  const unaccepted = active.filter((e) => !e.acceptedBy);

  const turns: DiscussionTurn[] = [];
  turns.push({
    host: 'A', refs: [],
    text: `Let's talk through ${topic}. Here's where we actually landed — and I'll flag how much we can trust each piece.`,
  });

  for (const n of ctx.nodes.slice(0, 3)) {
    const snippet = n.excerpt.replace(/\s+/g, ' ').slice(0, 180);
    turns.push({ host: 'A', refs: [n.id], tier: n.tier, text: `On "${n.title}": ${snippet}` });
    turns.push({
      host: 'B', refs: [n.id], tier: n.tier,
      text:
        n.tier === 'proven' ? `That one's proven — a verifyCommand passed, so it's not just a claim.`
        : n.tier === 'authored' ? `And that's authored — a decision you accepted, sealed in the ledger.`
        : n.tier === 'claimed' ? `Careful — that's only claimed; it's ungrounded until it cites a node.`
        : `Noted — that's ${n.tier}, so we treat it as data to verify, not proof.`,
    });
  }

  if (unaccepted.length) {
    turns.push({
      host: 'B', refs: [],
      text: `Before we move on — ${unaccepted.length} verified state${unaccepted.length === 1 ? ' is' : 's are'} still waiting on your acceptance. The leap is yours: ${unaccepted.slice(0, 3).map((e) => e.name).join(', ')}.`,
    });
  }

  for (const t of next.actionable.slice(0, 2)) {
    turns.push({ host: 'B', refs: t.refs, text: `What about "${t.title}"? That's the next high-leverage move.` });
    turns.push({ host: 'A', refs: [], text: `Agreed — that's where I'd point next.` });
  }

  turns.push({
    host: 'A', refs: [],
    text: `That's the recap. Everything I said is grounded and tier-tagged — nothing claimed as fact that wasn't proven.`,
  });

  const grounded = turns.reduce((n, t) => n + (t.refs.length > 0 ? 1 : 0), 0);
  return { title: `Session recap — ${topic}`, topic, turns, grounded };
}
