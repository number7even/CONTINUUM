/**
 * verify-odometer.mjs — proves the honest odometer cures silent-over-claiming:
 * with keys absent, EVERY gate is surfaced LOUDLY with its fix (no silent drop), and the
 * NULL owner-tenant UUIDs (the silent lead-loss root) are reported.
 *
 *   node verify-odometer.mjs
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { capabilityReport, renderCapability } from './odometer.mjs';

// Simulate the "no keys" state to force the gates the disease used to hide.
for (const k of ['WORLDMONITOR_API_KEY', 'FEEDLY_ACCESS_TOKEN', 'FEEDLY_STREAM_ID', 'ANTHROPIC_API_KEY', 'XENOS_LEADS_KEY', 'XENOS_LEADS_URL', 'STUDIOMUNICH_VAULT_SECRET']) {
  delete process.env[k];
}

const rep = capabilityReport();
process.stdout.write(renderCapability(rep)); // show the loud output

const wm = rep.providers.find((p) => p.id === 'worldmonitor');
const feedly = rep.providers.find((p) => p.id === 'feedly');
const llm = rep.capabilities.find((c) => c.name.startsWith('LLM'));
const leads = rep.capabilities.find((c) => c.name.startsWith('Lead routing'));

// Every gate must be LOUD (present + explains + gives a fix) — no silent omission.
const allProvidersPresent = rep.providers.length === rep.providersTotal && rep.providersTotal >= 7;
const gatedProviderLoud = !!wm && wm.live === false && typeof wm.fix === 'string' && wm.fix.length > 5
  && !!feedly && feedly.live === false && typeof feedly.fix === 'string';
const llmGatedLoud = !!llm && llm.live === false && !!llm.cost && !!llm.fix;
const leadsGatedLoud = !!leads && leads.live === false && /silently/i.test(leads.cost);
const silentLeadLossSurfaced = rep.tenants.total > 0 && rep.tenants.missing.length > 0;

console.log('');
console.log(`checks: providersPresent=${allProvidersPresent} gatedProviderLoud=${gatedProviderLoud} llmGated=${llmGatedLoud} leadsGated=${leadsGatedLoud} nullTenantsSurfaced=${silentLeadLossSurfaced}(${rep.tenants.filled}/${rep.tenants.total})`);
const green = allProvidersPresent && gatedProviderLoud && llmGatedLoud && leadsGatedLoud && silentLeadLossSurfaced;
console.log(green ? 'ODOMETER_VERIFY: GREEN — every gate is loud; the silent-over-claiming disease is cured' : 'ODOMETER_VERIFY: RED');
process.exit(green ? 0 : 1);
