'use client';

/**
 * AMF login — the access gate's front door. Posts to /api/auth; on success the
 * server sets the HMAC-signed session cookie and we land on the dashboard.
 *
 * Brand CI: Inkwell ground, Au Lait ink, Creme Brulee accent.
 */
import { useState } from 'react';

const PANEL = '#283133';
const HAIR = '#36423f';
const TEXT = '#f6f3ec';
const MUTED = '#9aa09a';
const CREME = '#c89a72';
const RED = '#ff8585';

export default function Login() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      }
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <form onSubmit={submit} style={{ width: 'min(380px, 100%)', background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 12, padding: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '-0.02em' }}>AMF · Headless Hive</h1>
        <p style={{ margin: '0.4rem 0 1.5rem', color: MUTED, fontSize: '0.88rem' }}>Operator access. This control room is gated.</p>

        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.82rem', color: TEXT }}>Access password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{ background: '#2a3335', color: TEXT, border: `1px solid ${HAIR}`, borderRadius: 8, padding: '0.7rem 0.9rem', fontSize: '0.95rem', outline: 'none' }}
          />
        </label>

        {error && (
          <div style={{ marginTop: '1rem', background: '#3a1010', border: `1px solid ${RED}55`, borderRadius: 8, padding: '0.7rem 0.9rem', color: RED, fontSize: '0.82rem' }}>
            {error.includes('not configured')
              ? <>Gating is not configured yet. Set <code>AMF_ACCESS_PASSWORD</code> + <code>AMF_SESSION_SECRET</code> in the deployment env.</>
              : error}
          </div>
        )}

        <button type="submit" disabled={busy || !password} style={{ marginTop: '1.5rem', width: '100%', padding: '0.75rem', borderRadius: 8, border: 'none', background: busy || !password ? '#3a4446' : CREME, color: busy || !password ? MUTED : '#1c2224', fontWeight: 600, fontSize: '0.95rem', cursor: busy || !password ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Verifying…' : 'Enter'}
        </button>
      </form>
    </main>
  );
}
