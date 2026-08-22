/**
 * continuum_p9_approve — the ANSWER half of the P9 loop, over the seam.
 *
 * VC-Hospitality's BFF cannot import continuum-core (two-repo seam: HTTP only), so without
 * this tool the approval endpoint would have to hand-build the seal's subject shape —
 * `{kind, id: hex, title: hex, contentHash: 'sha256:'+hex}` — in a second place. That is
 * exactly how the approval frame's hash drifted from the engine's and matched nothing for
 * any input. One producer of the shape, reached over the wire.
 *
 * WHAT THIS TOOL DOES NOT DO: authorise anything by itself. It writes a seal; p9Authorize
 * later reads the ledger and decides. And it cannot forge one — sealActionApproval binds
 * the operator, and authorize() ignores a seal whose operator is the proposing agent.
 *
 * The CALLER is responsible for having verified the human: session, role, and not-self.
 * That check belongs in the BFF where the session cookie lives, not here — this tool sees
 * only an operator string and must be treated as privileged.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { sealActionApproval, getP9Request } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const p9ApproveTool: ToolDefinition = {
  name: 'continuum_p9_approve',
  description:
    'Seal a human approval for ONE previously-suspended P9 action. The seal binds to a ' +
    'canonical hash of verb+target+params, so it authorises exactly that action and no ' +
    'other — a seal for a EUR 40 refund does not cover EUR 4000. verdict may be accept or ' +
    'override; reject is NOT consent and is recorded separately. The caller must already ' +
    'have verified the human operator (session, role, and that they are not the proposing ' +
    'agent) — this tool trusts the operator string it is given.',
  inputSchema: {
    type: 'object',
    properties: {
      verb: { type: 'string', description: 'The suspended action verb, e.g. spa_book.' },
      target: { type: 'string', description: 'The action target, e.g. member:902.' },
      params: { type: 'object', description: 'The EXACT params of the suspended action — any difference changes the hash and seals a different action.' },
      operator: { type: 'string', description: 'The verified human identity. Never an agent name.' },
      verdict: { type: 'string', description: "'accept' (default) or 'override'." },
      rationale: { type: 'string', description: 'Why the human approved.' },
      expectedRequestId: { type: 'string', description: 'Optional bare-hex id of the open p9-request. If given and it does not match the computed hash, the call is REFUSED — this catches a frame and engine that disagree about what is being approved.' },
    },
    required: ['verb', 'operator'],
  },
};

interface Args {
  verb?: string; target?: string; params?: Record<string, unknown>;
  operator?: string; verdict?: string; rationale?: string; expectedRequestId?: string;
}

export const handleP9Approve: ToolHandler = async (rawArgs, storage) => {
  const a = (rawArgs ?? {}) as Args;
  const verb = typeof a.verb === 'string' ? a.verb.trim() : '';
  const operator = typeof a.operator === 'string' ? a.operator.trim() : '';
  if (!verb) throw new Error('verb is required');
  if (!operator) throw new Error('operator is required — a seal with no human identity is not a seal');

  const verdict = a.verdict === 'override' ? 'override' : 'accept';
  const action = { verb, target: a.target, params: a.params ?? {} };

  const sealed = sealActionApproval(storage, action, {
    operator,
    verdict,
    rationale: a.rationale,
  });
  const hex = sealed.actionHash.replace(/^sha256:/, '');

  // If the caller said which request this was for, the hashes MUST agree. A mismatch means
  // the operator was shown one thing and is sealing another — refuse rather than seal the
  // action the client happened to send. Checked AFTER computing so the message can show both.
  if (a.expectedRequestId && a.expectedRequestId !== hex) {
    throw new Error(
      `refused: expectedRequestId ${a.expectedRequestId} does not match the hash of the ` +
      `submitted action (${hex}). The approval frame and the engine disagree about what is ` +
      `being approved — nothing has been authorised.`,
    );
  }

  const req = getP9Request(storage, hex);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ok: true,
        sealId: sealed.id,
        actionHash: hex,
        verdict,
        operator,
        matchedOpenRequest: req ? true : false,
      }, null, 2),
    }],
  };
};
