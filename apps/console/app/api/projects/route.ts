/**
 * GET  /api/projects  → { projects: string[], current: string }
 * POST /api/projects  { project }  → sets the continuum_project cookie (the live switch)
 *
 * Backs the ProjectSwitcher. The switch is a cookie so every server route
 * (brain / board / timeline) picks it up on the next fetch via resolveProject().
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { cookies } from 'next/headers';
import { listProjects, resolveProject, PROJECT_COOKIE, PROJECT_ID_SAFE } from '@/lib/project';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const projects = listProjects();
  const current = await resolveProject(projects[0]);
  return Response.json({ projects, current });
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { project?: string };
  const project = (body.project ?? '').trim();
  if (!project || !PROJECT_ID_SAFE.test(project)) {
    return Response.json({ error: 'invalid project id' }, { status: 400 });
  }
  // Only allow switching to a declared project (P4 — no silent access to arbitrary DBs).
  if (!listProjects().includes(project)) {
    return Response.json({ error: 'unknown project' }, { status: 404 });
  }
  (await cookies()).set(PROJECT_COOKIE, project, {
    httpOnly: false, // read by the client switcher to show the active choice
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ ok: true, current: project });
}
