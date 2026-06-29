/**
 * POST /api/demo-request — enterprise demo / access request capture.
 *
 * The single missing piece in the enterprise "sign up" step. Validates the
 * inquiry, then delivers it to wherever the operator points DEMO_WEBHOOK_URL
 * (Slack / Discord / Zapier / make.com webhook — no email service to integrate).
 * Degrades gracefully: if no webhook is configured it still accepts + logs the
 * lead (so the form never errors for the prospect), and the operator can read it
 * from the deployment logs until a webhook is set.
 *
 * Bound by The Nine. No secret required to deploy (DEMO_WEBHOOK_URL is optional,
 * P6 — safely endable). Server-rendered (opts out of prerender).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

interface Inquiry {
  name?: string;
  email?: string;
  company?: string;
  teamSize?: string;
  message?: string;
}

function clean(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export const POST: APIRoute = async ({ request }) => {
  let body: Inquiry;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid request' }), { status: 400 });
  }

  const inquiry = {
    name: clean(body.name, 200),
    email: clean(body.email, 320),
    company: clean(body.company, 200),
    teamSize: clean(body.teamSize, 50),
    message: clean(body.message, 4000),
    at: new Date().toISOString(),
  };

  // minimal validation
  if (!inquiry.email || !inquiry.email.includes('@') || !inquiry.company) {
    return new Response(JSON.stringify({ ok: false, error: 'email and company are required' }), { status: 400 });
  }

  const webhook = import.meta.env.DEMO_WEBHOOK_URL || process.env.DEMO_WEBHOOK_URL;
  const summary =
    `🟢 CONTINUUM enterprise demo request\n` +
    `Company: ${inquiry.company}\n` +
    `Name: ${inquiry.name || '(none)'}\n` +
    `Email: ${inquiry.email}\n` +
    `Team size: ${inquiry.teamSize || '(none)'}\n` +
    `Message: ${inquiry.message || '(none)'}\n` +
    `At: ${inquiry.at}`;

  if (webhook) {
    try {
      // Universal payload: `text` (Slack), `content` (Discord), and the raw
      // `inquiry` object (Zapier/Make/custom endpoints → email/sheet/CRM).
      // Each consumer reads the field it understands; extras are ignored.
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: summary, content: summary, inquiry }),
      });
    } catch (err) {
      // don't fail the prospect's submission if the webhook hiccups; log it.
      console.error('demo-request webhook failed:', err instanceof Error ? err.message : String(err));
    }
  } else {
    // No webhook yet — log so the operator can still retrieve the lead.
    console.log('[demo-request] (no DEMO_WEBHOOK_URL set)\n' + summary);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
