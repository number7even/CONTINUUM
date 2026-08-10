/**
 * telemetry-endpoint-template.js — Seam 2 endpoint template for the PodGeni server.
 *
 * PodGeni EXPOSES this route; Continuum PULLS it on a schedule via
 * telemetry-sync.mjs. Do NOT build a POST client — there is no Continuum
 * intake route to push to (docs/PODGENI_INTAKE_CONTRACT.md §5, commit d73e36f).
 *
 * Audited against apps/amf/worker/telemetry-sync.mjs fetchTelemetry():
 *   GET {base}/api/genome/engagement?tenant_id=<workspace_id>&since=<ISO8601>&limit=40
 *   header: x-telemetry-key  ·  response: bare array OR { events: [...] }
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
 */

'use strict';

const express = require('express');
const app = express();

// ── auth: shared scoped key in the x-telemetry-key header ────────────────────
const authenticateTelemetry = (req, res, next) => {
  const localKey = process.env.PODGENI_TELEMETRY_KEY;
  if (!localKey) {
    console.error('[telemetry] PODGENI_TELEMETRY_KEY not set on host.');
    return res.status(500).json({ error: 'telemetry key not configured' });
  }
  if (req.headers['x-telemetry-key'] !== localKey) {
    return res.status(401).json({ error: 'unauthorized telemetry pull' });
  }
  next();
};

// ── GET /api/genome/engagement — the pull surface Continuum polls ────────────
app.get('/api/genome/engagement', authenticateTelemetry, async (req, res) => {
  // Continuum sends `tenant_id` (NOT `tenant`) — intake contract §6, one workspace = one brain.
  const { tenant_id, since, limit } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'missing query parameter: tenant_id' });

  // Invalid `since` must not silently return everything or nothing — reject loudly.
  let sinceDate = new Date(0);
  if (since !== undefined) {
    sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: `unparseable 'since' timestamp: ${since}` });
    }
  }
  const maxResults = Math.min(Number.parseInt(limit, 10) || 40, 500);

  try {
    // ── DEVELOPER IMPLEMENTATION ─────────────────────────────────────────────
    // Replace with your real query (Firestore example):
    //   const snap = await db.collection('campaign_events')
    //     .where('tenant_id', '==', tenant_id)
    //     .where('measuredAt', '>', sinceDate)
    //     .orderBy('measuredAt').limit(maxResults).get();
    //   const dbEvents = snap.docs.map((d) => d.data());
    const dbEvents = [];

    // Strict §5 idempotent shape — one event per asset, raw counts only.
    // Reward derivation is SPINE-side (feedbackWeight()); never compute it here.
    const events = dbEvents.map((e) => ({
      id: e.id,                       // stable per-event id — Continuum upserts on it;
                                      // renaming an id double-counts the event
      decisionId: e.decisionId,       // from the bundle's sourceChain (the seal)
      signalId: e.signalId,           // from the sourceChain (the origin article)
      score: e.score ?? null,         // OPTIONAL normalized [0,1]; `?? null`, NOT `|| null`
                                      // (a legitimate score of 0 must survive)
      impressions: Number(e.impressions) || 0,
      engagements: Number(e.engagements) || 0,
      conversions: Number(e.conversions) || 0,
      summary: e.summary || '',       // carries the terms the ranker matches on
      style: e.style || '',           // the Creative Genome variant that ran
      product: e.product || '',
      tenant_id,                      // echo the workspace isolation key
      asset_id: e.asset_id,
    }));

    // fetchTelemetry() accepts a bare array or { events } — pick one, stay stable.
    return res.status(200).json({ events });
  } catch (err) {
    console.error('[telemetry] query failed:', err);
    return res.status(500).json({ error: 'failed to retrieve engagement data' });
  }
});

module.exports = app;
