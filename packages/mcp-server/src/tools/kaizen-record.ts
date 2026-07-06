/**
 * continuum_kaizen_record — record a Kaizen LEDGER entry into CONTINUUM.
 *
 * Wires the Kaizen discipline onto existing primitives (no parallel store):
 *   • writes the graded entry as an Observation (type='kaizen_ledger')
 *   • opens/updates the mission as a Todo whose verifyCommand is the blind run
 *   • the Todo only reaches 'done' when the entry is kaizen-ready (all 8 pass,
 *     adversarial patched, blind run executed clean, executor named) —
 *     verify-then-dissolve applied to a plan.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { gradeLedgerEntry, type KaizenLedgerEntry } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const kaizenRecordTool: ToolDefinition = {
  name: 'continuum_kaizen_record',
  description:
    'Record a Kaizen LEDGER entry: grade a mission plan against the 8-point standard and persist it. ' +
    'Writes the graded entry as an Observation and opens/updates the mission as a Todo whose ' +
    'verifyCommand is the blind run. The Todo only reaches "done" when the plan is kaizen-ready — ' +
    'all 8 points pass WITH evidence, every broken adversarial attack has a patch, the blind run was ' +
    'actually executed and clean (a claim is not a run), and the executor tier is named. Returns the verdict.',
  inputSchema: {
    type: 'object',
    required: ['mission', 'executor', 'grades'],
    properties: {
      mission: { type: 'string', description: 'Mission name/id (e.g. "01 build website").' },
      draftPath: { type: 'string', description: 'Where the plan draft lives.' },
      executor: { type: 'string', description: 'The NAMED mid-tier executor tier (e.g. "sonnet", "haiku").' },
      grades: {
        type: 'array',
        description: 'One grade per point (1..8): { point, pass, evidence }. A pass needs evidence.',
        items: {
          type: 'object',
          required: ['point', 'pass'],
          properties: {
            point: { type: 'number' },
            pass: { type: 'boolean' },
            evidence: { type: 'string' },
          },
        },
      },
      adversarial: {
        type: 'array',
        description: 'Adversarial results: { attack, result: "held"|"broke", patch? }. A "broke" needs a patch.',
        items: {
          type: 'object',
          required: ['attack', 'result'],
          properties: {
            attack: { type: 'string' },
            result: { type: 'string', enum: ['held', 'broke'] },
            patch: { type: 'string' },
          },
        },
      },
      patches: { type: 'array', items: { type: 'string' }, description: 'Refinement-loop patches applied.' },
      blindRun: {
        type: 'object',
        description: 'The blind run of point 8 — a RUN, not a claim.',
        properties: {
          ran: { type: 'boolean' },
          executor: { type: 'string' },
          completedWithoutQuestions: { type: 'boolean' },
          transcriptRef: { type: 'string' },
        },
      },
    },
  },
};

export const kaizenRecordTool_NAME = kaizenRecordTool.name;

export const handleKaizenRecord: ToolHandler = async (args, storage) => {
  const a = (args ?? {}) as Partial<KaizenLedgerEntry>;
  const entry: KaizenLedgerEntry = {
    mission: a.mission ?? 'unnamed mission',
    draftPath: a.draftPath ?? '',
    executor: a.executor ?? '',
    grades: Array.isArray(a.grades) ? a.grades : [],
    adversarial: Array.isArray(a.adversarial) ? a.adversarial : [],
    patches: Array.isArray(a.patches) ? a.patches : [],
    blindRun: a.blindRun,
  };
  const verdict = gradeLedgerEntry(entry);

  // 1) Persist the graded entry as an Observation (append-only ledger).
  storage.upsertSource('kaizen', 'export', { adapter: 'continuum-kaizen' }); // FK: source must exist
  const obs = storage.insertObservation({
    sourceId: 'kaizen',
    type: 'kaizen_ledger',
    content: `KAIZEN ${entry.mission} — ${verdict.ready ? 'READY' : 'not ready'} ${verdict.score}${verdict.failing.length ? ' · failing ' + verdict.failing.join(',') : ''}`,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: { kaizen: true, entry: entry as unknown as Record<string, unknown>, verdict: verdict as unknown as Record<string, unknown> },
  });

  // 2) Open/update the mission Todo — verify-then-dissolve on the blind run.
  const title = `kaizen: ${entry.mission}`;
  const verifyCommand = `blind run by ${entry.executor || '<unnamed>'} completes end-to-end with zero questions`;
  const existing = storage.listTodos({}).find((t) => t.title === title);
  const status = verdict.ready ? 'done' : 'in_progress';
  const refs = obs ? [obs.id] : [];
  const todo = existing
    ? storage.updateTodo({ id: existing.id, status, verifyCommand, refs: [...existing.refs, ...refs] })
    : storage.createTodo({ title, status, verifyCommand, refs });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            mission: entry.mission,
            verdict,
            observationId: obs?.id ?? null,
            todoId: todo.id,
            todoStatus: todo.status,
            note: verdict.ready
              ? 'Kaizen-ready — mission closed (blind run executed clean).'
              : 'Not ready — refine and re-record. See verdict.reasons.',
          },
          null,
          2,
        ),
      },
    ],
  };
};
