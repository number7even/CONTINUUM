/**
 * GET /api/trends — Zone 1 (Layer 2) real trend ingestion.
 *
 * Pulls REAL trending tech/builder stories from two PUBLIC, ToS-clean APIs:
 *   - Hacker News (official Algolia API — no auth)
 *   - Lobsters (public hottest.json)
 * Aggregates, scores each with a transparent velocity heuristic, returns the
 * top ranked topics. Every card links to its source so the operator can verify.
 *
 * HONESTY (The Nine, P4):
 *  - REAL data, not scaffold. (Reddit's public JSON is now blocked for
 *    datacenter IPs, so it's deliberately not used.)
 *  - "fun" is a documented heuristic (points + weighted comments, recency-
 *    decayed), NOT the ML "Fun Judge" of the full spec. Labelled as such in UI.
 *  - Only real signals are returned; X / TikTok / YouTube counts are NOT
 *    fabricated. Agent-Reach (cookie scraping of walled gardens) is held pending
 *    operator ToS review, so those sources are absent by design.
 *  - If both sources fail, returns ok:false; the UI shows a "source unreachable"
 *    state and never falls back to fake data.
 */
export const runtime = 'nodejs';
export const revalidate = 0;

interface Trend {
  topic: string;
  source: 'HN' | 'Lobsters';
  points: number;
  comments: number;
  ageHours: number;
  fun: number;
  url: string;
}

function funScore(points: number, comments: number, ageH: number): number {
  const eng = points + comments * 3;
  const velocity = eng / Math.pow(Math.max(0.5, ageH), 0.6);
  return Math.max(1, Math.min(99, Math.round(Math.log10(velocity + 1) * 26)));
}

async function fromHN(now: number): Promise<Trend[]> {
  const res = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30', {
    headers: { Accept: 'application/json' }, cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HN → HTTP ${res.status}`);
  const json = (await res.json()) as { hits: Array<{ title: string; points: number; num_comments: number; created_at_i: number; url: string | null; objectID: string }> };
  return (json.hits ?? []).filter((h) => h.title).map((h) => {
    const ageH = (now - h.created_at_i) / 3600;
    return {
      topic: h.title,
      source: 'HN' as const,
      points: h.points ?? 0,
      comments: h.num_comments ?? 0,
      ageHours: Math.round(ageH),
      fun: funScore(h.points ?? 0, h.num_comments ?? 0, ageH),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    };
  });
}

async function fromLobsters(now: number): Promise<Trend[]> {
  const res = await fetch('https://lobste.rs/hottest.json', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Lobsters → HTTP ${res.status}`);
  const json = (await res.json()) as Array<{ title: string; score: number; comment_count: number; created_at: string; url: string; comments_url: string }>;
  return (json ?? []).filter((s) => s.title).map((s) => {
    const ageH = (now - new Date(s.created_at).getTime() / 1000) / 3600;
    return {
      topic: s.title,
      source: 'Lobsters' as const,
      points: s.score ?? 0,
      comments: s.comment_count ?? 0,
      ageHours: Math.round(ageH),
      fun: funScore(s.score ?? 0, s.comment_count ?? 0, ageH),
      url: s.url || s.comments_url,
    };
  });
}

export async function GET(): Promise<Response> {
  const now = Date.now() / 1000;
  const settled = await Promise.allSettled([fromHN(now), fromLobsters(now)]);
  const trends: Trend[] = [];
  const failed: string[] = [];
  const names = ['HN', 'Lobsters'];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') trends.push(...r.value);
    else failed.push(names[i]);
  });

  if (trends.length === 0) {
    return Response.json({ ok: false, error: 'Both public trend sources were unreachable.', failed }, { status: 502 });
  }

  trends.sort((a, b) => b.fun - a.fun);
  return Response.json({
    ok: true,
    source: 'Hacker News + Lobsters (public)',
    fetchedAt: new Date().toISOString(),
    degraded: failed.length ? failed : undefined,
    trends: trends.slice(0, 9),
  });
}
