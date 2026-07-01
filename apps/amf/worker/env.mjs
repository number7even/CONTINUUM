/**
 * env.mjs — load apps/amf/worker/.env.local into process.env (zero-dep). Import FIRST.
 *
 * Keeps secrets out of the shell/chat (P1): keys live only in the gitignored .env.local.
 * Real process.env always wins (never overridden), so CI/inline env still works.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const txt = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '.env.local'), 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || /^\s*#/.test(line)) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v; // real env wins
  }
} catch { /* no .env.local — fine, providers gate themselves (P6) */ }
