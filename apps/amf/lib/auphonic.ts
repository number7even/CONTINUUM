/**
 * Auphonic API client (AMF Layer 4 audio).
 *
 * Thin, verified wrapper over the real Auphonic REST API. See
 * docs/AMF-L4-AUDIO-CONTRACT.md for the full contract.
 *
 * Secret: AUPHONIC_API_KEY (Bearer). Per P1/P9 it is read from env only and
 * never logged. hasAuphonicKey() lets routes return a clean 503 when unset
 * (P6 — safely endable; nothing runs without the operator-injected key).
 */
const BASE = 'https://auphonic.com/api';

export function hasAuphonicKey(): boolean {
  return Boolean(process.env.AUPHONIC_API_KEY);
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.AUPHONIC_API_KEY ?? ''}` };
}

export interface AuphonicProduction {
  uuid: string;
  status: number; // 3 = Done, 2 = Error (full list: /api/info/production_status.json)
  status_string?: string;
  output_files?: Array<{ download_url: string; format: string; ending: string }>;
}

/** Create a production from a preset, with our webhook callback set. */
export async function createProduction(opts: { presetUuid: string; webhook: string; title: string }): Promise<string> {
  const res = await fetch(`${BASE}/productions.json`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset: opts.presetUuid, webhook: opts.webhook, metadata: { title: opts.title } }),
  });
  if (!res.ok) throw new Error(`Auphonic create → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data: { uuid: string } };
  return json.data.uuid;
}

/** Upload the raw audio (multipart, field input_file). */
export async function uploadAudio(uuid: string, file: Blob, filename: string): Promise<void> {
  const form = new FormData();
  form.append('input_file', file, filename);
  const res = await fetch(`${BASE}/production/${uuid}/upload.json`, {
    method: 'POST',
    headers: authHeaders(), // do NOT set Content-Type; fetch sets the multipart boundary
    body: form,
  });
  if (!res.ok) throw new Error(`Auphonic upload → HTTP ${res.status}`);
}

/** Start processing. */
export async function startProduction(uuid: string): Promise<void> {
  const res = await fetch(`${BASE}/production/${uuid}/start.json`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error(`Auphonic start → HTTP ${res.status}`);
}

/** Fetch a production's current state + output files. */
export async function getProduction(uuid: string): Promise<AuphonicProduction> {
  const res = await fetch(`${BASE}/production/${uuid}.json`, { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Auphonic get → HTTP ${res.status}`);
  const json = (await res.json()) as { data: AuphonicProduction };
  return json.data;
}
