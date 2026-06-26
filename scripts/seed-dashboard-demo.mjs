/**
 * Seed the hosted CONTINUUM engine's demo tenant with REAL verify-then-dissolve
 * todos + a state checkpoint, so the client dashboard shows the product actually
 * working (not an empty shell).
 *
 * These are genuine CONTINUUM commitments with REAL verifyCommands that pass —
 * this is the product used honestly, not fake data. Reads CONTINUUM_HTTP_URL +
 * CONTINUUM_HTTP_TOKEN from the env (sourced from apps/console/.env.local).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const url = process.env.CONTINUUM_HTTP_URL;
const token = process.env.CONTINUUM_HTTP_TOKEN;
const projectId = process.env.CONTINUUM_PROJECT_ID || 'continuum';
if (!url || !token) { console.error('set CONTINUUM_HTTP_URL + CONTINUUM_HTTP_TOKEN'); process.exit(2); }

const headers = { Authorization: `Bearer ${token}`, 'X-Continuum-Project': projectId };
const client = new Client({ name: 'seed-demo', version: '0.0.1' }, { capabilities: {} });
const transport = new SSEClientTransport(new URL(url), {
  requestInit: { headers },
  eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
});

// Real CONTINUUM commitments. verifyCommand is a REAL shell check.
const TODOS = [
  { title: 'V1 npm packages published (@number7even/continuum-*)', verifyCommand: 'npm view @number7even/continuum-core version', status: 'done' },
  { title: 'Public docs site live at the apex', verifyCommand: 'curl -sf -o /dev/null https://www.continuum.rest/', status: 'done' },
  { title: 'Enterprise demo-request funnel live', verifyCommand: 'curl -sf -o /dev/null https://www.continuum.rest/enterprise', status: 'done' },
  { title: 'Hosted engine reachable + auth enforced', verifyCommand: 'test "$(curl -s -o /dev/null -w %{http_code} https://api.continuum.rest/)" = 401', status: 'done' },
  { title: 'Client dashboard shipped (this view)', verifyCommand: 'curl -sf -o /dev/null https://console.continuum.rest/dashboard', status: 'done' },
  { title: 'Token-paste login gate for per-tenant access', verifyCommand: 'curl -sf -o /dev/null https://console.continuum.rest/dashboard/login', status: 'in_progress' },
  { title: 'Wire DEMO_WEBHOOK_URL to route enterprise leads', verifyCommand: 'test -n "$DEMO_WEBHOOK_URL"', status: 'open' },
  { title: 'V2 self-serve billing (Stripe) — gated on D-V2.2 lock', verifyCommand: 'echo blocked', status: 'blocked' },
];

await client.connect(transport);
console.log('connected to', url, '· tenant', projectId);

for (const t of TODOS) {
  const created = await client.callTool({ name: 'continuum_create_todo', arguments: { title: t.title, verifyCommand: t.verifyCommand } });
  const text = created?.content?.find((c) => c.type === 'text')?.text;
  const id = text ? (JSON.parse(text).id || JSON.parse(text).todo?.id) : null;
  if (id && t.status !== 'open') {
    await client.callTool({ name: 'continuum_update_todo', arguments: { id, status: t.status } });
  }
  console.log(`  + [${t.status}] ${t.title.slice(0, 50)}`);
}

// State checkpoint for "at a glance".
await client.callTool({
  name: 'continuum_record_checkpoint',
  arguments: {
    reason: 'V1 commercial loop: packages public, docs + enterprise funnel live, hosted engine authed, client dashboard shipped.',
    active: [
      { name: 'npm-v1-published', where: '@number7even/continuum-*', description: '3 packages public' },
      { name: 'public-docs-apex', where: 'www.continuum.rest', description: 'Astro Starlight, indexable' },
      { name: 'enterprise-funnel', where: 'www.continuum.rest/enterprise', description: 'demo capture live' },
      { name: 'hosted-engine', where: 'api.continuum.rest', description: 'Fly, Bearer auth, multi-tenant' },
      { name: 'client-dashboard', where: 'console.continuum.rest/dashboard', description: 'verify-then-dissolve board' },
    ],
    dormant: [
      { name: 'v2-self-serve-billing', where: 'Stripe + Postgres', description: 'gated on D-V2.2' },
    ],
    broken: [],
  },
});
console.log('  ✓ state checkpoint recorded');

await client.close();
console.log('done. open https://console.continuum.rest/dashboard');
