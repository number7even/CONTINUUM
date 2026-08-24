#!/usr/bin/env node
// verify-claim-render-gate.mjs — the gate for build ② (todo c9d04e92).
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
import { createRequire } from 'node:module';
const { gateClaim, requireGate, absence, gatedCount } = createRequire(import.meta.url)('./vc-handoff/claim-render-gate.js');

const results = [];
const check = (name, ok) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}`); };

// 1. Clean verified claim passes untouched
check('verified + plain claim → passes', requireGate('The seal re-derives and matches.', 'verified') === 'The seal re-derives and matches.');
// 2. Reported may not claim local verification
check('reported + "fully integrated and verified" → grammar violation',
  gateClaim('The wall is fully integrated and verified across systems.', 'reported').violations.some((v) => v.kind === 'grammar'));
// 3. Vision may not claim existence
check('vision + "deployed, delivering results" → grammar violation',
  gateClaim('The mediator is deployed and delivering results.', 'vision').violations.some((v) => v.kind === 'grammar'));
// 4. THE GAUNTLET LESSON: puffery fails even on verified truth
check('verified + "working flawlessly!" → PUFFERY violation (tone independent of truth)',
  gateClaim('The token loop is complete and working flawlessly!', 'verified').violations.some((v) => v.kind === 'puffery'));
// 5. Absence is explicit, never silent
let silentAbsence = false; try { absence(''); } catch { silentAbsence = true; }
const card = absence('engine unreachable (ECONNREFUSED :7878)', { source: 'brain' });
check('absence requires a reason + yields explicit card', silentAbsence && card.kind === 'absence' && card.reason.includes('ECONNREFUSED'));
// 6. No zero-defaults on failed fetch — but a REAL zero is data
let zeroBlocked = false; try { gatedCount(0, { fetchOk: false }); } catch (e) { zeroBlocked = e.kind === 'zero-default'; }
check('count(0, fetch FAILED) → refused; count(0, fetch OK) → legitimate',
  zeroBlocked && gatedCount(0, { fetchOk: true }) === 0);
// 7. Unknown tag refused
check('unknown odometer tag → refused', gateClaim('anything', 'probably-fine').ok === false);

const pass = results.every(Boolean);
console.log(`\nCLAIM_RENDER_GATE_VERIFY: ${pass ? 'GREEN' : 'RED'} — ${results.filter(Boolean).length}/${results.length}`);
process.exit(pass ? 0 : 1);
