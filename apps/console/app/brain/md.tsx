'use client';
/**
 * Markdown — a tiny, dependency-free markdown renderer for the content sidebar.
 *
 * Handles headings, bold/italic, inline + fenced code, bullet/ordered lists,
 * blockquotes, horizontal rules, links, and paragraphs. Not CommonMark-complete
 * (no tables/nested lists) — just enough to render a repo's .md docs cleanly in
 * the right panel without pulling a heavy dep.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import React from 'react';

const codeInline: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11, background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4, color: '#c7ffe6' };

function inline(text: string, kb: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={kb + i} style={{ color: '#f1f5f9' }}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={kb + i}>{m[3]}</em>);
    else if (m[4]) out.push(<code key={kb + i} style={codeInline}>{m[4]}</code>);
    else if (m[5]) out.push(<a key={kb + i} href={m[6]} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>{m[5]}</a>);
    last = m.index + m[0].length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const H: Record<number, React.CSSProperties> = {
  1: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: '14px 0 8px' },
  2: { fontSize: 15, fontWeight: 700, color: '#e5e7eb', margin: '14px 0 6px' },
  3: { fontSize: 13.5, fontWeight: 600, color: '#e5e7eb', margin: '12px 0 5px' },
};

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0, key = 0;
  const isBlockStart = (l: string) => /^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>\s|\s*---+\s*$)/.test(l);
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim().startsWith('```')) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) { buf.push(lines[i]!); i++; }
      i++;
      blocks.push(<pre key={key++} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, background: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 6, overflowX: 'auto', color: '#d1d5db', margin: '6px 0' }}>{buf.join('\n')}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lvl = Math.min(3, h[1]!.length); blocks.push(<div key={key++} style={H[lvl]}>{inline(h[2]!, 'h' + key)}</div>); i++; continue; }
    if (/^\s*---+\s*$/.test(line)) { blocks.push(<hr key={key++} style={{ border: 0, borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 0' }} />); i++; continue; }
    if (/^\s*>\s?/.test(line)) { blocks.push(<div key={key++} style={{ borderLeft: '3px solid rgba(56,189,248,0.4)', padding: '2px 0 2px 10px', margin: '6px 0', color: '#9fb4c8' }}>{inline(line.replace(/^\s*>\s?/, ''), 'q' + key)}</div>); i++; continue; }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]!) || /^\s*\d+\.\s+/.test(lines[i]!))) {
        const item = lines[i]!.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '');
        items.push(<li key={key++} style={{ marginBottom: 3 }}>{inline(item, 'li' + key)}</li>);
        i++;
      }
      blocks.push(<ul key={key++} style={{ margin: '6px 0', paddingLeft: 18 }}>{items}</ul>);
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !isBlockStart(lines[i]!)) { buf.push(lines[i]!); i++; }
    blocks.push(<p key={key++} style={{ margin: '6px 0' }}>{inline(buf.join(' '), 'p' + key)}</p>);
  }
  return <div style={{ fontSize: 12.5, lineHeight: 1.55, color: '#d1d5db' }}>{blocks}</div>;
}
