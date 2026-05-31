/**
 * Prompt registry + lookup.
 *
 * Aggregates the per-prompt PromptDefinition objects into PROMPTS[] for
 * ListPromptsRequestSchema and exposes findPrompt() for
 * GetPromptRequestSchema.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { PromptDefinition } from '../tool-types.js';
import { sessionStartPrompt } from './session-start.js';
import { citePrompt } from './cite.js';

export const PROMPTS: readonly PromptDefinition[] = [
  sessionStartPrompt,
  citePrompt,
] as const;

export function findPrompt(name: string): PromptDefinition | undefined {
  return PROMPTS.find(p => p.name === name);
}
