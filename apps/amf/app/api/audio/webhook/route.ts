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
import { transition, getJobStore } from '../../../../lib/job';

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

  const store = getJobStore();
  const now = () => new Date().toISOString();

  // Correlate Auphonic uuid → our job (submit persisted it).
  const job = await store.byAuphonicUuid(uuid);

  // status 2 = Error, 3 = Done (Auphonic). Anything else: ignore (still working).
  if (status === '2') {
    if (job) await store.put(transition(job, 'error', now(), { note: 'Auphonic reported error' }));
    return Response.json({ ok: true, uuid, handled: 'error', correlated: Boolean(job) });
  }
  if (status !== '3') {
    return Response.json({ ok: true, uuid, handled: 'ignored', status });
  }

  if (!hasAuphonicKey()) {
    return new Response('AUPHONIC_API_KEY not set; cannot fetch production result.', { status: 503 });
  }

  try {
    const prod = await getProduction(uuid);
    // prod.output_files[] holds the enhanced audio + transcript/subtitle URLs.

    if (job) {
      // Transition: enhanced → (aligning) → ready-for-assembly.
      let next = transition(job, 'enhanced', now(), {
        note: 'Auphonic done',
        data: { outputs: prod.output_files?.map((f) => f.format) ?? [] },
      });
      // TODO(L4): download enhanced audio + transcript to object storage (Vercel Blob).
      // TODO(L4): forced-alignment pass (whisperx | aeneas) → word-level timings.
      //           Auphonic subtitles are segment-level only; word-level is the
      //           contract's load-bearing mitigation (§0). Sets payload.words +
      //           wordLevelSource, then transition → 'ready-for-assembly'.
      await store.put(next);
    }

    return Response.json({
      ok: true,
      uuid,
      correlated: Boolean(job),
      durableStore: store.durable,
      auphonicStatus: prod.status,
      outputs: prod.output_files?.map((f) => f.format) ?? [],
      note: job
        ? 'job advanced to "enhanced"; Blob download + word-alignment → ready-for-assembly gated on KV/Blob/engine (contract §3, §5).'
        : 'no job correlated (in-memory store does not survive across invocations — provision Vercel KV).',
    });
  } catch (err) {
    return new Response(`webhook handler failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
}
