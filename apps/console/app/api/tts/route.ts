/**
 * POST /api/tts — the brain's voice, spoken in OUR own stack (Supertonic).
 *
 * Same-origin proxy to Supertonic's OpenAI-compatible endpoint
 * (`supertonic serve` → POST /v1/audio/speech). The browser posts {text}; we
 * return audio/wav. If the Supertonic server isn't running we answer 503, and
 * the client falls back to the browser's speechSynthesis — wired-and-gated, so
 * the brain talks in our voice the moment `supertonic serve` is up, and still
 * works before then.
 *
 * Run our voice locally:  supertonic serve --host 127.0.0.1 --port 7788
 * Override target with:   SUPERTONIC_TTS_URL (default http://127.0.0.1:7788/v1/audio/speech)
 */
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const url = process.env.SUPERTONIC_TTS_URL || 'http://127.0.0.1:7788/v1/audio/speech';
  const voice = process.env.SUPERTONIC_VOICE || 'M1';

  let text = '';
  try {
    const body = (await req.json()) as { text?: string };
    text = String(body.text ?? '').slice(0, 800).trim();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (!text) return new Response('empty text', { status: 400 });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'supertonic', input: text, voice, response_format: 'wav' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return new Response(`tts upstream ${r.status}`, { status: 502 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
    });
  } catch {
    // Supertonic server not reachable → client falls back to speechSynthesis.
    return new Response('tts-unavailable', { status: 503 });
  }
}
