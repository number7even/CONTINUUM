/**
 * supervisor.mjs — the AMF autopilot keeper (Sprint 1: "it runs while I sleep").
 *
 * The event-loop worker and its Redis substrate previously had NO keeper: a crash
 * at 3am was silent until a human looked. This closes that gap (the "0 unattended
 * runs" line in docs/AMF_ENGINE_MAP.md, Stage L). The supervisor:
 *
 *   1. ensureRedis()  — brings Redis up on :6379, layered: external TCP → docker
 *                       start amf-redis → docker run → (colima start then retry).
 *                       Fail-loudly (P8): if it can't, health says so; it never
 *                       silently pretends the substrate is live.
 *   2. supervises event-loop.mjs — (re)starts it ONLY when Redis is confirmed up,
 *                       restarts on unexpected exit with capped backoff, stops it
 *                       cleanly if Redis drops (no crash-thrash against a dead :6379).
 *   3. writes out/health.json every heartbeat — the single at-a-glance truth the
 *                       doctor surface + the morning pulse read. Silence contract:
 *                       a fresh healthy beat is the proof the night ran clean.
 *
 * Modes:
 *   node supervisor.mjs           → run (ensure Redis, keep worker alive, beat health)
 *   node supervisor.mjs --status  → print the current out/health.json and exit
 *   node supervisor.mjs --smoke   → DETERMINISTIC supervision proof (no Redis needed):
 *                                   spawn a child, kill it, assert restart < 60s +
 *                                   health file written, exit 0. Runs in CI.
 *
 * For boot-survival (login/reboot) install the launchd plist beside this file:
 *   com.number7even.amf.supervisor.plist  →  ~/Library/LaunchAgents/
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const HEALTH = join(OUT, 'health.json');

const REDIS_HOST = '127.0.0.1';
const REDIS_PORT = 6379;
const REDIS_CONTAINER = 'amf-redis';
const HEARTBEAT_MS = Number(process.env.SUP_HEARTBEAT_MS || 10_000);
const MAX_BACKOFF_MS = Number(process.env.SUP_MAX_BACKOFF_MS || 30_000);
const SOAK_TARGET_NIGHTS = Number(process.env.SUP_SOAK_NIGHTS || 7);

/** TCP-ping a host:port — resolves true if something accepts within `ms`. No deps. */
function tcpUp(host, port, ms = 800) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(ms);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

async function sh(cmd, args, timeout = 60_000) {
  try { const { stdout } = await execFileP(cmd, args, { timeout }); return { ok: true, out: (stdout || '').trim() }; }
  catch (e) { return { ok: false, out: (e.stdout || '').trim(), err: (e.stderr || e.message || '').trim() }; }
}

/**
 * Bring Redis up on :6379. Layered, idempotent, fail-loud.
 * @returns {{up:boolean, method:string, detail:string}}
 */
async function ensureRedis() {
  if (await tcpUp(REDIS_HOST, REDIS_PORT)) return { up: true, method: 'external', detail: 'already listening' };

  const hasDocker = (await sh('command', ['-v', 'docker']).catch(() => ({ ok: false }))).ok
    || existsSync('/usr/local/bin/docker') || existsSync('/opt/homebrew/bin/docker');

  const tryDocker = async () => {
    // fast path: an existing (stopped) container
    await sh('docker', ['start', REDIS_CONTAINER], 30_000);
    if (await tcpUp(REDIS_HOST, REDIS_PORT, 1500)) return { up: true, method: 'docker', detail: `started ${REDIS_CONTAINER}` };
    // slow path: create it
    const run = await sh('docker', ['run', '-d', '--name', REDIS_CONTAINER, '-p', `${REDIS_PORT}:${REDIS_PORT}`, 'redis:7-alpine'], 90_000);
    if (await tcpUp(REDIS_HOST, REDIS_PORT, 3000)) return { up: true, method: 'docker', detail: `ran ${REDIS_CONTAINER}` };
    return { up: false, method: 'docker', detail: run.err || 'docker could not open :6379' };
  };

  if (hasDocker) {
    let r = await tryDocker();
    if (r.up) return r;
    // docker daemon may be down under colima — start it and retry once
    const hasColima = existsSync('/opt/homebrew/bin/colima') || existsSync('/usr/local/bin/colima')
      || (await sh('command', ['-v', 'colima']).catch(() => ({ ok: false }))).ok;
    if (hasColima && /daemon|connect|Cannot/i.test(r.detail)) {
      await sh('colima', ['start'], 180_000);
      r = await tryDocker();
      if (r.up) return { ...r, detail: `colima start → ${r.detail}` };
    }
    return r;
  }
  return { up: false, method: 'down', detail: 'no docker/redis-server available to open :6379' };
}

/** A supervised child process with restart bookkeeping. */
class Guard {
  constructor(name, cmd, args) { this.name = name; this.cmd = cmd; this.args = args; this.proc = null; this.restarts = 0; this.lastExit = null; this._crashes = []; this._stopping = false; }
  get alive() { return !!this.proc && this.proc.exitCode === null && !this.proc.killed; }
  start(onExit) {
    if (this.alive) return;
    this.proc = spawn(this.cmd, this.args, { cwd: HERE, stdio: 'inherit', env: process.env });
    this.proc.once('exit', (code, signal) => {
      this.lastExit = { code, signal, at: new Date().toISOString() };
      const wasStopping = this._stopping; this._stopping = false; this.proc = null;
      if (!wasStopping) onExit && onExit(code, signal);
    });
  }
  /** capped exponential backoff keyed on recent (<60s) crash count — tames thrash */
  backoffMs() {
    const now = Date.now();
    this._crashes = this._crashes.filter((t) => now - t < 60_000);
    this._crashes.push(now);
    return Math.min(MAX_BACKOFF_MS, 500 * 2 ** (this._crashes.length - 1));
  }
  stop() { if (this.alive) { this._stopping = true; this.proc.kill('SIGTERM'); } }
}

function writeHealth(state) {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const status = state.redis.up && state.worker.alive ? 'healthy' : (state.redis.up || state.worker.alive ? 'degraded' : 'down');
  const doc = { ts: new Date().toISOString(), status, ...state };
  writeFileSync(HEALTH, JSON.stringify(doc, null, 2));
  return doc;
}

async function run() {
  const started = new Date().toISOString();
  const soakStarted = process.env.SUP_SOAK_START || started;
  const worker = new Guard('event-loop.mjs', 'node', [join(HERE, 'event-loop.mjs')]);
  let redis = { up: false, method: 'down', detail: 'starting' };
  let stopping = false;

  const onWorkerExit = (code, signal) => {
    worker.restarts += 1;
    const wait = worker.backoffMs();
    console.error(`[supervisor] worker exited (code=${code} signal=${signal}) — restart #${worker.restarts} in ${wait}ms`);
    setTimeout(() => { if (!stopping && redis.up) worker.start(onWorkerExit); }, wait);
  };

  const beat = async () => {
    redis = await ensureRedis();
    if (redis.up && !worker.alive && !stopping) { console.error('[supervisor] Redis up → starting worker'); worker.start(onWorkerExit); }
    if (!redis.up && worker.alive) { console.error('[supervisor] Redis down → parking worker (no thrash)'); worker.stop(); }
    const doc = writeHealth({
      supervisor: { pid: process.pid, started, uptime_s: Math.round(process.uptime()) },
      redis,
      worker: { name: worker.name, alive: worker.alive, pid: worker.proc?.pid ?? null, restarts: worker.restarts, lastExit: worker.lastExit },
      soak: { active: true, started: soakStarted, nights_target: SOAK_TARGET_NIGHTS },
    });
    console.error(`[supervisor] ${doc.status} · redis=${redis.up ? redis.method : 'DOWN'} · worker=${worker.alive ? 'alive' : 'stopped'} · restarts=${worker.restarts}`);
  };

  console.error(`[supervisor] up (pid ${process.pid}) · heartbeat ${HEARTBEAT_MS}ms · soak target ${SOAK_TARGET_NIGHTS} nights → ${HEALTH}`);
  await beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  const shutdown = () => { stopping = true; clearInterval(timer); worker.stop(); writeHealth({ supervisor: { pid: process.pid, started, uptime_s: Math.round(process.uptime()) }, redis, worker: { name: worker.name, alive: false, pid: null, restarts: worker.restarts, lastExit: worker.lastExit }, soak: { active: false, started: soakStarted, nights_target: SOAK_TARGET_NIGHTS } }); console.error('[supervisor] shutdown'); setTimeout(() => process.exit(0), 300); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function status() {
  if (!existsSync(HEALTH)) { console.error('[supervisor] no out/health.json yet — supervisor has not run.'); process.exit(1); }
  const doc = JSON.parse(readFileSync(HEALTH, 'utf8'));
  const ageS = (Date.now() - new Date(doc.ts).getTime()) / 1000;
  console.error(`AMF supervisor health (beat ${ageS.toFixed(0)}s ago):`);
  console.error(`  status : ${doc.status}`);
  console.error(`  redis  : ${doc.redis.up ? doc.redis.method + ' — ' + doc.redis.detail : 'DOWN — ' + doc.redis.detail}`);
  console.error(`  worker : ${doc.worker.alive ? 'alive pid ' + doc.worker.pid : 'stopped'} · restarts ${doc.worker.restarts}`);
  console.error(`  soak   : ${doc.soak.active ? 'night-clock running since ' + doc.soak.started : 'inactive'} (target ${doc.soak.nights_target})`);
  process.exit(doc.status === 'down' ? 2 : 0);
}

/**
 * Deterministic supervision proof — NO Redis, NO docker. Proves the load-bearing
 * guarantee: a killed child comes back < 60s and health.json is written.
 */
async function smoke() {
  console.error('\nAMF supervisor smoke — proving auto-restart + heartbeat (no Redis needed)\n');
  const child = new Guard('dummy', 'node', ['-e', 'setInterval(()=>{},1e9)']);
  let restarts = 0;
  const onExit = () => { restarts += 1; setTimeout(() => child.start(onExit), 200); };
  child.start(onExit);
  await new Promise((r) => setTimeout(r, 300));
  const firstPid = child.proc?.pid;
  const t0 = Date.now();

  writeHealth({ supervisor: { pid: process.pid, started: new Date().toISOString(), uptime_s: 0 }, redis: { up: false, method: 'smoke', detail: 'n/a' }, worker: { name: 'dummy', alive: child.alive, pid: firstPid, restarts: 0, lastExit: null }, soak: { active: false, started: null, nights_target: SOAK_TARGET_NIGHTS } });

  child.proc.kill('SIGKILL');                             // simulate a 3am crash
  await new Promise((r) => setTimeout(r, 1200));           // allow restart
  const backMs = Date.now() - t0;
  const restarted = restarts >= 1 && child.alive && child.proc?.pid && child.proc.pid !== firstPid;
  const under60 = backMs < 60_000;
  const healthWritten = existsSync(HEALTH);
  child.stop();

  const ok = restarted && under60 && healthWritten;
  console.error(`[verify] child restarted     : ${restarted} (pid ${firstPid} → ${child.proc?.pid ?? 'n/a'})`);
  console.error(`[verify] restart under 60s   : ${under60} (${backMs}ms)`);
  console.error(`[verify] health.json written : ${healthWritten}`);
  console.error(`\n${ok ? '✅ PASS' : '❌ FAIL'} — supervisor: crashed worker returns < 60s, health beats to disk\n`);
  process.exit(ok ? 0 : 1);
}

const arg = process.argv[2];
if (arg === '--smoke') smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
else if (arg === '--status') status();
else run().catch((e) => { console.error('[supervisor] fatal:', e.message); process.exit(1); });
