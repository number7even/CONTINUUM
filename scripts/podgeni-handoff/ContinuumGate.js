/**
 * ContinuumGate.js — Seam 1 drop-in for the PodGeni GCloud/Firebase scheduler.
 *
 * JIT fail-closed verification of a sealed asset against the live Continuum
 * engine, called immediately before scheduling/publishing. Zero dependencies
 * (Node 18+ global fetch).
 *
 * Wire contract: docs/PODGENI_INTAKE_CONTRACT.md §2 (commit d73e36f).
 * Audited against packages/mcp-server/src/http.ts GET /api/observation/:id
 * (live-fire-proven 2026-08-08).
 *
 * Usage:
 *   const gate = new ContinuumGate();
 *   await gate.verifyAsset(decisionId, expectedHash, tenantJwt); // throws → do NOT schedule
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
 */

'use strict';

/** Strip an optional "sha256:" prefix so bundle-format and seal-format hashes compare. */
function canonicalHash(h) {
  return String(h ?? '').trim().toLowerCase().replace(/^sha256:/, '');
}

class ContinuumGate {
  /**
   * @param {Object} [config]
   * @param {string} [config.engineUrl='https://api.continuum.rest']
   * @param {number} [config.timeoutMs=5000]  JIT budget — on timeout we fail CLOSED.
   */
  constructor(config = {}) {
    this.engineUrl = (config.engineUrl || 'https://api.continuum.rest').replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs || 5000;
  }

  /**
   * Verify a sealed asset just-in-time. Resolves true ONLY when every check passes;
   * throws (fail closed — abort the schedule) in every other case, including
   * network failure and engine unreachability.
   *
   * @param {string} decisionId   From the bundle's sourceChain (the seal id).
   * @param {string} expectedHash Re-derived locally over the EXACT asset about to run
   *                              ('sha256:' prefix optional — normalized before compare).
   * @param {string} tenantJwt    The workspace's RS256 tenant JWT (minted on-target).
   * @returns {Promise<true>}
   */
  async verifyAsset(decisionId, expectedHash, tenantJwt, tenantId) {
    if (!decisionId) throw new Error('[ContinuumGate] Denied: missing decisionId. Fail closed.');
    if (!expectedHash) throw new Error('[ContinuumGate] Denied: missing expectedHash. Fail closed.');
    if (!tenantJwt) throw new Error('[ContinuumGate] Denied: missing tenant JWT. Fail closed.');

    const url = `${this.engineUrl}/api/observation/${encodeURIComponent(decisionId)}`;
    // X-Continuum-Project is OPTIONAL in JWT mode (tenant resolves from the signed
    // claim; a sent header must EQUAL the claim or the engine 403s). Sending it is
    // free defense-in-depth: a wrong-tenant misconfiguration fails loudly at 403
    // instead of surfacing later as a confusing 404. Value = tenant id, never a
    // project name. Omit when unknown.
    const headers = { Authorization: `Bearer ${tenantJwt}`, Accept: 'application/json' };
    if (tenantId) headers['X-Continuum-Project'] = tenantId;
    let res;
    try {
      res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // Timeout, DNS, refused connection — the engine is unreachable: fail CLOSED.
      throw new Error(`[ContinuumGate] Denied: engine unreachable (${err.message}). Fail closed.`);
    }

    if (res.status === 401) throw new Error('[ContinuumGate] Denied (401): token invalid/expired. Fail closed.');
    if (res.status === 404) throw new Error(`[ContinuumGate] Denied (404): decision '${decisionId}' not found in this tenant. Fail closed.`);
    if (res.status !== 200) throw new Error(`[ContinuumGate] Denied (${res.status}): unexpected engine response. Fail closed.`);

    let seal;
    try {
      seal = await res.json();
    } catch (err) {
      throw new Error(`[ContinuumGate] Denied: unparseable verification payload (${err.message}). Fail closed.`);
    }

    // The seal must BE a seal: a decision, and an accepting one. A sealed
    // REJECTION with a matching hash must not schedule (contract §3;
    // verdict value is "accept" — the old "approved" gate refused every real bundle).
    if (seal.type !== 'decision') {
      throw new Error(`[ContinuumGate] Denied: observation '${decisionId}' is type='${seal.type}', not a decision. Fail closed.`);
    }
    if (seal.verdict !== 'accept') {
      throw new Error(`[ContinuumGate] Denied: seal verdict is '${seal.verdict}', not 'accept'. Fail closed.`);
    }

    const liveHash = canonicalHash(seal.subject && seal.subject.contentHash);
    if (!liveHash) {
      throw new Error('[ContinuumGate] Denied: verification projection lacks subject.contentHash. Fail closed.');
    }
    if (liveHash !== canonicalHash(expectedHash)) {
      throw new Error(
        '[ContinuumGate] SECURITY VIOLATION: seal mismatch — asset altered after approval.\n' +
          `  expected (local): ${canonicalHash(expectedHash)}\n` +
          `  sealed   (spine): ${liveHash}\n` +
          'Fail closed.',
      );
    }

    return true;
  }
}

module.exports = ContinuumGate;
module.exports.canonicalHash = canonicalHash;
