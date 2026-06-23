/**
 * GET /api/audio/status?uuid=… — polling fallback for AMF L4 audio.
 *
 * When the webhook can't reach us (local dev, callback failures), poll the
 * Auphonic production directly. Contract: docs/AMF-L4-AUDIO-CONTRACT.md §3.
 * Gated on AUPHONIC_API_KEY (P6).
 */
import { hasAuphonicKey, getProduction } from '../../../../lib/auphonic';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  if (!hasAuphonicKey()) {
    return new Response('AUPHONIC_API_KEY not set.', { status: 503 });
  }
  const uuid = new URL(req.url).searchParams.get('uuid');
  if (!uuid) return new Response('uuid query param required', { status: 400 });
  try {
    const prod = await getProduction(uuid);
    const done = prod.status === 3;
    return Response.json({
      ok: true,
      uuid,
      auphonicStatus: prod.status,
      statusString: prod.status_string,
      done,
      outputs: done ? prod.output_files?.map((f) => ({ format: f.format, url: f.download_url })) : undefined,
    });
  } catch (err) {
    return new Response(`status check failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
}
