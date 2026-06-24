/**
 * POST /api/audio/submit — AMF L4 audio: accept a human voice recording and
 * kick off Auphonic enhancement + speech recognition.
 *
 * Contract: docs/AMF-L4-AUDIO-CONTRACT.md §3. Gated on AUPHONIC_API_KEY (clean
 * 503 until the operator injects it — P6). multipart/form-data: `audio` (the
 * recording) + `jobId`.
 */
import { hasAuphonicKey, createProduction, uploadAudio, startProduction } from '../../../../lib/auphonic';
import { createJob, transition, getJobStore } from '../../../../lib/job';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  if (!hasAuphonicKey()) {
    return new Response('AUPHONIC_API_KEY is not configured on this deployment. Set it in the continuum-amf env to enable L4 audio enhancement.', { status: 503 });
  }
  const presetUuid = process.env.AUPHONIC_PRESET_UUID;
  if (!presetUuid) {
    return new Response('AUPHONIC_PRESET_UUID is not set. Create a preset in the Auphonic dashboard (enhancement + speech recognition + outputs) and set its UUID.', { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response('expected multipart/form-data', { status: 400 });
  }
  const audio = form.get('audio');
  const jobId = String(form.get('jobId') ?? `job_${Math.random().toString(36).slice(2, 10)}`);
  if (!(audio instanceof Blob)) {
    return new Response('audio file (field "audio") is required', { status: 400 });
  }

  const origin = new URL(req.url).origin;
  try {
    const now = new Date().toISOString();
    const store = getJobStore();
    let job = createJob(jobId, { trendTopic: String(form.get('trendTopic') ?? '') || undefined }, now);

    const uuid = await createProduction({
      presetUuid,
      webhook: `${origin}/api/audio/webhook`,
      title: jobId,
    });
    await uploadAudio(uuid, audio, 'recording');
    await startProduction(uuid);

    // Persist into the append-only job state. The webhook correlates back via
    // auphonicUuid. NOTE: store.durable=false (in-memory) does NOT survive across
    // serverless invocations — production needs Vercel KV (see lib/job.ts).
    job = { ...transition(job, 'enhancing', new Date().toISOString(), { note: 'submitted to Auphonic' }), auphonicUuid: uuid };
    await store.put(job);

    return Response.json({
      ok: true,
      jobId,
      auphonicUuid: uuid,
      phase: job.phase,
      durableStore: store.durable,
      warning: store.durable ? undefined : 'In-memory job store: webhook correlation will not survive in production. Provision Vercel KV.',
    });
  } catch (err) {
    return new Response(`Auphonic submit failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
}
