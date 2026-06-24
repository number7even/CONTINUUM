/**
 * GET /api/audio/status?uuid=… — polling fallback for AMF L4 audio.
 *
 * When the webhook can't reach us (local dev, callback failures), poll the
 * Auphonic production directly. Contract: docs/AMF-L4-AUDIO-CONTRACT.md §3.
 * Gated on AUPHONIC_API_KEY (P6).
 */
import { hasAuphonicKey, getProduction } from '../../../../lib/auphonic';
import { getJobStore } from '../../../../lib/job';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;

  // jobId path: read the append-only job state (the worker-queue document).
  const jobId = params.get('jobId');
  if (jobId) {
    const job = await getJobStore().get(jobId);
    if (!job) return Response.json({ ok: false, error: 'job not found (in-memory store does not persist across invocations — provision Vercel KV)' }, { status: 404 });
    return Response.json({ ok: true, job });
  }

  // uuid path: poll Auphonic directly (fallback when webhook can't reach us).
  if (!hasAuphonicKey()) {
    return new Response('AUPHONIC_API_KEY not set.', { status: 503 });
  }
  const uuid = params.get('uuid');
  if (!uuid) return new Response('jobId or uuid query param required', { status: 400 });
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
