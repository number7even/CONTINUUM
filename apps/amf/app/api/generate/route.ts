/**
 * POST /api/generate — AMF Layer-3 content generation.
 *
 * Receives { topic, format, angle }, streams structured content back as plain
 * text deltas. Uses the Vercel AI SDK + Claude. The system prompt encodes the
 * AMF "Addictive Storytelling" structure (Stakes -> Big Question -> Head Fake
 * -> Rehook) and the Doubt-Driven Development discipline: do not invent
 * statistics or sources.
 *
 * Bound by The Nine (AGENTS.md). No fabricated facts; the model is told to mark
 * any claim it cannot stand behind as a placeholder for the operator to verify.
 */
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Format = 'video-script' | 'social-thread' | 'blog-outline';

const FORMAT_BRIEF: Record<Format, string> = {
  'video-script':
    'a short-form video script (45-90 seconds, ~130-180 words spoken). Output: a HOOK line (first 3 seconds), then 3-5 BEATS each with [VISUAL] and spoken VO, then a CTA. Mark b-roll/visual cues in brackets.',
  'social-thread':
    'a social thread of 5-7 posts. Post 1 is the hook (must earn the scroll-stop on its own). Each post is one idea, under 280 characters, no hashtag spam (max 2, only if they add reach). End with a clear CTA post.',
  'blog-outline':
    'a blog post outline: a working title, a one-sentence promise, then H2 sections each with 2-3 bullet beats, plus a closing CTA. Aim for skimmable structure a writer can expand.',
};

const SYSTEM = `You are the content engine of an Autonomous Media Factory, bound by The Nine (a discipline of verifiable trust).

Write using the Addictive Storytelling structure, applied to whatever format is requested:
- STAKES: open by making clear what the viewer/reader gains or loses. Specific, not generic.
- BIG QUESTION: pose the tension the piece will resolve.
- HEAD FAKE: include at least one prediction-error beat — set up an expectation, then subvert it with something true and non-obvious.
- REHOOK: every section should end with a reason to keep going.

Hard rules (Doubt-Driven Development — verify before you assert):
- NEVER invent statistics, study citations, dates, or quotes. If a number would strengthen the piece, write it as [STAT: describe what to verify] for the operator to fill in. Do not fabricate authority.
- No marketing buzzwords (supercharge, unleash, game-changer, seamless, revolutionary). Use specific verbs and concrete nouns.
- No em dashes. Use commas, colons, periods, or parentheses.
- Match the requested format exactly. Be tight; cut filler.

Output the content directly in clean Markdown. Do not add preamble like "Here is your script". Start with the content.`;

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('ANTHROPIC_API_KEY is not configured on this deployment.', { status: 503 });
  }
  let body: { topic?: string; format?: Format; angle?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  const topic = (body.topic ?? '').trim();
  const format = (body.format ?? 'video-script') as Format;
  const angle = (body.angle ?? '').trim();
  if (!topic) return new Response('topic is required', { status: 400 });
  if (!FORMAT_BRIEF[format]) return new Response('unknown format', { status: 400 });

  const prompt =
    `Topic: ${topic}\n` +
    (angle ? `Angle / audience: ${angle}\n` : '') +
    `\nProduce ${FORMAT_BRIEF[format]}`;

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM,
    prompt,
    temperature: 0.7,
  });

  return result.toTextStreamResponse();
}
