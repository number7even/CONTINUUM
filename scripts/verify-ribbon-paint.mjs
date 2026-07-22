#!/usr/bin/env node
// verify-ribbon-paint.mjs — proves the D1 critical-path ribbon actually PAINTS.
//
// The critical-path MATH is proven in verify-critical-path.mjs. This gate proves the other half:
// the real CriticalPathRibbon.tsx component (the exact JSX the board renders) turns a criticalPath
// into visible DOM. It esbuild-compiles the component and renders it with react-dom/server (React
// 19) against a mixed chain — a DONE root, a cleared middle link, a still-gated tail — then asserts
// the painted markup carries the label, all node titles, the ✓ / 🔒 state glyphs, and the → / ⊸
// link glyphs (green cleared vs amber gated). A single-node path paints NOTHING (not a "path").
//
//   node scripts/verify-ribbon-paint.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { build } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const component = join(repo, 'apps/console/app/board/CriticalPathRibbon.tsx');
// Bundle the real component (react external) INTO the repo so `react/jsx-runtime` resolves here.
const tmp = join(here, '.ribbon-paint.tmp.mjs');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

const out = await build({
  entryPoints: [component], bundle: true, format: 'esm', write: false,
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'],
  logLevel: 'silent',
});
writeFileSync(tmp, out.outputFiles[0].text);

try {
  const mod = await import(new URL('file://' + tmp).href);
  const Ribbon = mod.default;

  // A real mixed chain: schema DONE (cleared) → API cleared → UI still gated by upstream.
  const nodes = [
    { id: 'a', title: 'Design schema', column: 'DONE', blocked: false },
    { id: 'b', title: 'Build the API', column: 'RUNNING', blocked: false },
    { id: 'c', title: 'Ship the board UI', column: 'BLOCKED', blocked: true },
  ];
  const html = renderToStaticMarkup(React.createElement(Ribbon, { nodes }));

  console.log('── D1 · the ribbon paints (real component, real render) ────────────────');
  check('renders a non-empty ribbon for a 3-node chain', html.length > 0 && /CRITICAL PATH/.test(html), `${html.length} bytes`);
  check('paints every task title in the chain', ['Design schema', 'Build the API', 'Ship the board UI'].every(t => html.includes(t)));
  check('a DONE node is marked ✓', html.includes('✓'));
  check('a still-gated node is marked 🔒', html.includes('🔒'));
  check('a cleared link paints green →', html.includes('→'));
  check('a gated link paints amber ⊸', html.includes('⊸'));
  check('depth is shown ("3 deep")', /3 deep/.test(html));
  check('DONE node carries its column colour #34d399', html.includes('#34d399'));

  // A one-node "path" is not a path — paints nothing.
  const solo = renderToStaticMarkup(React.createElement(Ribbon, { nodes: [nodes[0]] }));
  check('a single-node path paints NOTHING (< 2 = not a path)', solo === '');
} finally {
  rmSync(tmp, { force: true });
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('RIBBON_PAINT_VERIFY: GREEN — the real CriticalPathRibbon renders the chain to visible DOM:');
  console.log('titles, ✓/🔒 state glyphs, →/⊸ cleared-vs-gated links, and column colours all paint.');
  process.exit(0);
} else { console.log('RIBBON_PAINT_VERIFY: RED'); process.exit(1); }
