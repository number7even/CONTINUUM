#!/usr/bin/env node
/**
 * @number7even/continuum — the marketed entry point.
 *
 * This thin launcher forwards to the CLI implementation
 * (@number7even/continuum-cli) so the marketed one-liner
 *
 *     npx @number7even/continuum init
 *
 * resolves the clean name and runs the real CLI. The `-cli` package stays the
 * implementation (already published, has the `continuum` bin + full command
 * surface); this package exists only to make the marketed name resolve —
 * fixing the install-404 that killed Time-To-First-Value at step one.
 *
 * We SPAWN the CLI (rather than import it) so it runs exactly as if invoked
 * directly — its `main()` is guarded to only run when executed as the entry
 * module, so importing it would be a no-op.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cliEntry = require.resolve('@number7even/continuum-cli/dist/index.js');
const { status } = spawnSync(process.execPath, [cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(status ?? 0);
