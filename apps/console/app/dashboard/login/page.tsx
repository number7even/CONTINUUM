'use client';

/**
 * Dashboard login — token-paste gate (concierge model).
 *
 * The client pastes the tenant Bearer/JWT token the operator provisioned for
 * them. We POST it to /api/dashboard/session which validates it against the
 * engine and sets an HttpOnly cookie; the dashboard then connects as THEIR
 * tenant. No accounts, no OAuth — exactly the provisioning runbook.
 */
import { useState } from 'react';

const INK = '#232b2d', PANEL = '#283133', HAIR = '#36423f', TEXT = '#f6f3ec',
  MUTED = '#9aa09a', BODY = '#c8c3b6', CREME = '#c89a72', RED = '#ff8585';

export default function Login() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!res.ok) throw new Error((await res.text().catch(() => res.statusText)) || `HTTP ${res.status}`);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: INK, color: TEXT, fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <form onSubmit={submit} style={{ width: 'min(440px, 100%)', background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 12, padding: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '-0.02em' }}>Continuum</h1>
        <p style={{ margin: '0.4rem 0 1.5rem', color: MUTED, fontSize: '0.88rem' }}>
          Enter your tenant access token to open your dashboard.
        </p>
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.82rem', color: BODY }}>Tenant access token</span>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the token we provisioned for you…"
            rows={3}
            autoFocus
            style={{ background: '#2a3335', color: TEXT, border: `1px solid ${HAIR}`, borderRadius: 8, padding: '0.7rem 0.9rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
          />
        </label>
        {error && (
          <div style={{ marginTop: '1rem', background: '#3a1010', border: `1px solid ${RED}55`, borderRadius: 8, padding: '0.7rem 0.9rem', color: RED, fontSize: '0.82rem' }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={busy || !token.trim()} style={{ marginTop: '1.5rem', width: '100%', padding: '0.75rem', borderRadius: 8, border: 'none', background: busy || !token.trim() ? '#3a4446' : CREME, color: busy || !token.trim() ? MUTED : '#1c2224', fontWeight: 600, fontSize: '0.95rem', cursor: busy || !token.trim() ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Connecting…' : 'Open dashboard'}
        </button>
        <p style={{ margin: '1.25rem 0 0', color: '#5b6360', fontSize: '0.75rem' }}>
          Don&rsquo;t have a token? <a href="https://www.continuum.rest/enterprise" style={{ color: CREME }}>Request enterprise access</a>.
        </p>
      </form>
    </main>
  );
}
