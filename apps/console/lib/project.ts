/**
 * Project resolution — lets ONE console roam every product's engine.
 *
 * The engine's HTTP/SSE transport routes by the `X-Continuum-Project` header, so a
 * single running engine can serve many project DBs. This resolver decides which
 * project the current request is pointed at:
 *
 *   1. the `continuum_project` cookie (set by the ProjectSwitcher) — the live choice
 *   2. the CONTINUUM_PROJECT_ID env — the deploy default
 *   3. the caller's fallback (routes historically defaulted to 'continuum' or 'graph-demo')
 *
 * `listProjects()` is the switcher's menu: CONTINUUM_PROJECTS (comma-separated) ∪ the
 * default. No "list projects" MCP tool exists yet, so the menu is operator-declared
 * (P4 — we don't invent a capability the engine doesn't expose).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { cookies } from 'next/headers';

const SAFE = /^[a-z0-9][a-z0-9._-]*$/i;

/** The project this request targets. Cookie → env → caller fallback. */
export async function resolveProject(fallback = 'continuum'): Promise<string> {
  try {
    const c = (await cookies()).get('continuum_project')?.value;
    if (c && SAFE.test(c)) return c;
  } catch { /* cookies() unavailable in some contexts */ }
  return process.env.CONTINUUM_PROJECT_ID ?? fallback;
}

/** The projects this console can switch between (operator-declared). */
export function listProjects(): string[] {
  const set = new Set(
    (process.env.CONTINUUM_PROJECTS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && SAFE.test(s)),
  );
  const dflt = process.env.CONTINUUM_PROJECT_ID;
  if (dflt && SAFE.test(dflt)) set.add(dflt);
  if (set.size === 0) set.add('continuum');
  return [...set];
}

export const PROJECT_COOKIE = 'continuum_project';
export const PROJECT_ID_SAFE = SAFE;
