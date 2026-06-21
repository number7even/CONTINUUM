/**
 * Internal types shared by the tools/, resources/, and prompts/ modules.
 *
 * Mirrors MCP's CallToolResult / ReadResourceResult shapes without depending
 * on the SDK's runtime schemas — keeps per-file imports light and lets each
 * tool/resource/prompt file stay self-contained.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { StorageBackend } from '@number7even/continuum-core';

// ── Tools ───────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type ToolHandler = (
  args: unknown,
  storage: StorageBackend,
) => Promise<ToolResult>;

// ── Resources ───────────────────────────────────────────────────────────────

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface ResourceContents {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

export type ResourceReader = (
  storage: StorageBackend,
  projectId: string,
) => Promise<ResourceContents> | ResourceContents;

// ── Prompts ─────────────────────────────────────────────────────────────────

export interface PromptDefinition {
  name: string;
  description: string;
  text: string;
}
