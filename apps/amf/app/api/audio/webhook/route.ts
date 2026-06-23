/**
 * POST /api/audio/webhook — Auphonic callback (AMF L4).
 *
 * Auphonic POSTs form fields { uuid, status } when a production finishes
 * (status 3 = Done, 2 = Error). Contract: docs/AMF-L4-AUDIO-CONTRACT.md §1-3.
 *
 * Public endpoint (Auphonic-called). We correlate the uuid to our job, fetch
 * the result + outputs, run the word-level alignment pass, and emit the L5
 * payload. The correlation + alignment steps are gated on operator decisions
 * (durable store, alignment engine) and marked TODO(L4).
 */
import { hasAuphonicKey, getProduction } from '../../../../lib/auphonic';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  let uuid: string | null = null;
  let status: string | null = null;
  try {
    const form = await req.formData();
    uuid = form.get('uuid') ? String(form.get('uuid')) : null;
    status = form.get('status') ? String(form.get('status')) : null;
  } catch {
    return new Response('expected form data', { status: 400 });
  }
  if (!uuid) return new Response('uuid required', { status: 400 });

  // status 2 = Error, 3 = Done (Auphonic). Anything else: ignore (still working).
  if (status === '2') {
    // TODO(L4): mark job(uuid) failed in the durable store.
    return Response.json({ ok: true, uuid, handled: 'error' });
  }
  if (status !== '3') {
    return Response.json({ ok: true, uuid, handled: 'ignored', status });
  }

  if (!hasAuphonicKey()) {
    // Webhook arrived but we can't fetch the result without the key.
    return new Response('AUPHONIC_API_KEY not set; cannot fetch production result.', { status: 503 });
  }

  try {
    const prod = await getProduction(uuid);
    // prod.output_files[] holds the enhanced audio + transcript/subtitle URLs.

    // TODO(L4): correlate uuid -> jobId via the durable store (submit persisted it).
    // TODO(L4): download enhanced audio + transcript to object storage (Vercel Blob).
    // TODO(L4): forced-alignment pass on the enhanced audio to produce word-level
    //           timings (whisperx | aeneas) — Auphonic subtitles are segment-level
    //           only; word-level is the contract's load-bearing mitigation (§0).
    // TODO(L4): assemble + persist the L5AudioPayload (lib/l5-payload.ts) and set
    //           status: 'ready-for-assembly'.

    return Response.json({
      ok: true,
      uuid,
      auphonicStatus: prod.status,
      outputs: prod.output_files?.map((f) => f.format) ?? [],
      note: 'result fetched; correlation + alignment + persistence gated on operator store/engine choice (see contract §3, §5).',
    });
  } catch (err) {
    return new Response(`webhook handler failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
}
