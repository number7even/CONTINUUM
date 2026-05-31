/**
 * continuum.cite — Observation-ID citation discipline prompt.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { PromptDefinition } from '../tool-types.js';

export const citePrompt: PromptDefinition = {
  name: 'continuum.cite',
  description:
    'Citation discipline. When asserting any fact about the project, cite the ' +
    'Observation ID(s) that prove it. If no citation is possible, say so explicitly ' +
    'rather than asserting unverified claims.',
  text:
    'When asserting any fact about this project, cite the Observation ID that proves ' +
    'it.\n\n' +
    'Format:\n\n' +
    '  > The voice cutoff bug was fixed in commit 2aa4f96a5 ' +
    '[obs:81223c05-4465-480c-a56d-14f665ffb581].\n\n' +
    '  > The StorageBackend abstraction was materialised on 2026-05-15 in commit ' +
    'e725ae7 [obs:<id>].\n\n' +
    'If you cannot cite an Observation ID for a claim, say so explicitly:\n\n' +
    "  > I don't have a Continuum observation that proves this — recommend recording " +
    'one via `continuum_record_checkpoint`, or surface the question to the operator.\n\n' +
    'Never claim a fact about project state without either an Observation cite or an ' +
    'explicit "uncited" admission. The verify-then-dissolve discipline depends on ' +
    'provenance — facts without it cannot be re-verified later.',
};
