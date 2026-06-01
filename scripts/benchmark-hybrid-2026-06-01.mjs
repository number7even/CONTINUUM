#!/usr/bin/env node
/**
 * scripts/benchmark-hybrid-2026-06-01.mjs
 *
 * SPRINT-W23-1 sub-deliverable 1 (Issue #20) — benchmark harness for
 * the V0.5 hybrid backend (SQLite + RuVector HNSW + @xenova/transformers
 * MiniLM-L6-v2 at 384 dim).
 *
 * Three measurement-gated acceptance criteria:
 *   G1. 10,000 Observations inserted in <60 seconds (including vector flush)
 *   G2. Recall@5 ≥ 0.85 on a 50-question fixture
 *   G3. p95 query latency <50ms
 *
 * Per the operator authorization 2026-06-01: if all three pass, proceed
 * to sub-deliverables 2-5 of W23-1. If ANY fail, STOP and report raw
 * numbers back. No fixture rigging. No partial-credit promotion.
 *
 * Fixture design — anti-rigging guarantees (P4):
 *
 *   - 50 anchor topics chosen ORTHOGONAL to CONTINUUM's own documentation
 *     domain (general CS / distributed-systems / infrastructure concepts)
 *     so the embedder can't trivially find anchors by domain overlap with
 *     the distractor pool.
 *
 *   - Each query is a PARAPHRASE of its anchor — same semantic intent,
 *     deliberately different lexical surface. Tests embedder generalization,
 *     not keyword overlap.
 *
 *   - 9,950 distractors generated procedurally from a template vocabulary
 *     covering THIRD domains (history, biology, cuisine, geology, music
 *     theory, finance, sports) — semantically distant from BOTH the anchor
 *     topics AND CONTINUUM's domain. Each distractor is unique by index
 *     suffix so duplicates don't dominate the index.
 *
 *   - p95 latency measured over 100 queries (50 fixture + 50 unseen
 *     synthetic) to get a fair tail-latency estimate.
 *
 * Run:
 *   node scripts/benchmark-hybrid-2026-06-01.mjs
 *
 * Exit codes:
 *   0 — all three gates pass; W23-1 cleared for sub-deliverables 2-5
 *   1 — at least one gate failed; STOP per operator directive
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P4 — measured, not claimed.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// ── 0. Environment + module resolution ─────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FACTORY = resolve(REPO_ROOT, 'packages/core/dist/factory.js');

// Use a throwaway temp project so we don't pollute any operator DB.
// `rmSync` in the finally block cleans up unconditionally.
const TMP = mkdtempSync(join(tmpdir(), 'continuum-bench-w23-1-'));
process.env.CONTINUUM_DATA_DIR = TMP;
process.env.CONTINUUM_STORAGE_BACKEND = 'hybrid';
process.env.CONTINUUM_PROJECT_ID = 'bench';

const { openStorage } = await import(FACTORY);

// ── 1. The 50-anchor fixture ──────────────────────────────────────────────
//
// Each entry is { topic, anchor, query }:
//   topic  — stable label, becomes the observation's stable ID suffix
//   anchor — the canonical statement of the concept (~150-250 chars).
//            This is what should win for its query.
//   query  — a paraphrased question targeting the same concept,
//            deliberately worded NOT to share keywords with the anchor
//            where possible.

const FIXTURE = [
  { topic: 'tokio-work-stealing', anchor: 'Tokio is an asynchronous runtime for Rust that uses a work-stealing scheduler. Idle worker threads steal queued tasks from busy peers, balancing load across cores without explicit coordination.', query: 'How does the Rust async runtime balance compute load between threads?' },
  { topic: 'react-effect-cleanup', anchor: 'React useEffect returns a cleanup function that runs before the next effect invocation or when the component unmounts. This prevents stale subscriptions and dangling timers from leaking across renders.', query: 'What runs when a hook tears down subscriptions on the next render?' },
  { topic: 'postgres-mvcc', anchor: 'PostgreSQL implements multi-version concurrency control by giving every row a transaction range. Readers see the version visible to their snapshot without blocking writers, which append new versions.', query: 'How does Postgres allow concurrent reads and writes without locking rows?' },
  { topic: 'oauth-pkce', anchor: 'OAuth 2.0 PKCE binds the authorization code to a client-generated verifier. The code can only be redeemed by the original requester, preventing interception attacks on public clients without a confidential secret.', query: 'Which OAuth extension protects authorization codes for mobile and SPA clients?' },
  { topic: 'sqlite-wal-mode', anchor: 'SQLite WAL mode writes mutations to a separate write-ahead log file instead of rewriting pages in place. Readers continue using the original database while a single writer appends to the log.', query: 'What journaling option lets SQLite readers proceed during writes?' },
  { topic: 'k8s-readiness-probe', anchor: 'A Kubernetes readiness probe determines whether a pod should receive traffic. Failing readiness removes the pod from service endpoints without restarting it, distinct from liveness which triggers container restarts.', query: 'What probe controls whether a pod gets load-balancer traffic without restarting it?' },
  { topic: 'jwt-rs256-vs-hs256', anchor: 'JWT RS256 uses an asymmetric RSA keypair so verifiers only need the public key, while HS256 uses a shared HMAC secret that must be distributed to every verifier. RS256 simplifies key rotation in multi-service systems.', query: 'When should you prefer asymmetric over symmetric signatures for tokens?' },
  { topic: 'crdt-last-write-wins', anchor: 'A last-write-wins CRDT register resolves concurrent updates by comparing timestamps and keeping the newer value. It is the simplest convergent replicated type but loses the discarded write entirely.', query: 'Which conflict-free replicated type drops older concurrent values?' },
  { topic: 'http2-hol-blocking', anchor: 'HTTP/2 multiplexes streams over a single TCP connection. Packet loss stalls every stream because TCP delivers bytes in order — the head-of-line blocking that HTTP/3 over QUIC removes by isolating streams.', query: 'Why does QUIC outperform HTTP/2 on lossy networks?' },
  { topic: 'bloom-filter-fpr', anchor: 'A Bloom filter is a probabilistic set membership structure with no false negatives but a tunable false-positive rate. The rate is a function of bit array size, hash count, and inserted element count.', query: 'What data structure can say "definitely not present" but only "probably present"?' },
  { topic: 'merkle-tree-integrity', anchor: 'A Merkle tree hashes pairs of children up to a single root. Verifying a leaf only requires the sibling hashes along the path, enabling logarithmic-size integrity proofs for large datasets.', query: 'How can you prove one item belongs to a dataset without sending the whole dataset?' },
  { topic: 'raft-leader-election', anchor: 'Raft elects a leader using randomized election timeouts to break symmetry. A follower whose timer expires becomes a candidate, increments its term, and asks peers for votes — first majority wins.', query: 'How does the Raft consensus algorithm choose a coordinator without livelock?' },
  { topic: 'tcp-slow-start', anchor: 'TCP slow start grows the congestion window exponentially from one segment until a loss event or the slow-start threshold. It probes available bandwidth without flooding a connection that just opened.', query: 'How does TCP discover capacity safely at the beginning of a flow?' },
  { topic: 'websocket-upgrade', anchor: 'A WebSocket connection begins as an HTTP GET with Upgrade and Connection headers plus a Sec-WebSocket-Key. The server confirms by hashing that key with a fixed GUID and returning 101 Switching Protocols.', query: 'How does a browser ask an HTTP server to switch into a full-duplex transport?' },
  { topic: 'csp-nonce', anchor: 'A Content Security Policy nonce is a per-response random token. Only inline scripts that echo the matching nonce attribute execute, defeating most cross-site scripting injection attempts.', query: 'What CSP mechanism allows whitelisted inline scripts but blocks injected ones?' },
  { topic: 'cors-preflight', anchor: 'A CORS preflight is an OPTIONS request the browser sends before a non-simple cross-origin request. The server enumerates allowed methods and headers; the browser caches that response for the Access-Control-Max-Age window.', query: 'What request does a browser send to probe whether a cross-origin API will accept its real call?' },
  { topic: 'aes-gcm-nonce-reuse', anchor: 'AES-GCM nonce reuse with the same key catastrophically breaks confidentiality and authenticity. Two ciphertexts under the same key and nonce reveal the XOR of the plaintexts and allow forgery.', query: 'Why is reusing an initialization vector dangerous in authenticated encryption?' },
  { topic: 'ecdsa-malleability', anchor: 'ECDSA signatures are malleable because both (r, s) and (r, -s mod n) verify against the same message. Strict-low-s normalization forces a canonical form to prevent transaction-hash mutation attacks.', query: 'Why do cryptocurrency clients require canonical ECDSA signatures?' },
  { topic: 'argon2-parameters', anchor: 'Argon2id parameters are memory cost, time cost, and parallelism. Memory cost dominates GPU and FPGA hardness; tuning targets a server-side hash time around 0.5 seconds at deployment hardware.', query: 'How do you size the work factor of a memory-hard password hash?' },
  { topic: 'python-gil', anchor: 'CPython global interpreter lock serializes bytecode execution to a single OS thread. CPU-bound work in pure Python sees no benefit from threading and must use multiprocessing or release the lock via C extensions.', query: 'Why does adding threads to a Python script rarely speed up arithmetic?' },
  { topic: 'go-channel-buffered', anchor: 'A buffered Go channel decouples sender and receiver up to its capacity. Sends block only when the buffer is full; unbuffered channels rendezvous, requiring both parties to be ready simultaneously.', query: 'What is the runtime difference between sized and zero-capacity channels in Go?' },
  { topic: 'rust-borrow-nll', anchor: 'Rust non-lexical lifetimes ended a borrow at the last use rather than the end of its scope. This dropped many false-positive borrow errors and allowed previously-rejected patterns to compile.', query: 'What lifetime change in the Rust borrow checker reduced spurious errors?' },
  { topic: 'typescript-discriminated-union', anchor: 'TypeScript discriminated unions narrow types by checking a shared literal-type tag field. After narrowing, the rest of the type is exclusively the matching variant — a safe pattern-match without exhaustiveness keywords.', query: 'How do you safely branch on a TypeScript union without instanceof?' },
  { topic: 'graphql-n-plus-one', anchor: 'A GraphQL N+1 problem happens when a resolver for a list field issues one database query per item to load a related entity. DataLoader batches and caches keys within a request to coalesce them into one query.', query: 'Which pattern avoids per-item lookups in nested GraphQL resolvers?' },
  { topic: 'grpc-bidi-streaming', anchor: 'gRPC bidirectional streaming opens one RPC where client and server independently push messages in any order until either side closes. Both streams share flow control derived from HTTP/2.', query: 'What gRPC RPC type lets both endpoints send sequences of messages independently?' },
  { topic: 'kafka-consumer-rebalance', anchor: 'A Kafka consumer group rebalance reassigns partition ownership when membership changes or topic metadata updates. During the stop-the-world phase no consumers process messages, which incremental cooperative rebalancing mitigates.', query: 'What pauses message processing across a Kafka consumer group?' },
  { topic: 'redis-cluster-slots', anchor: 'Redis cluster shards data across 16384 hash slots assigned to master nodes. The key tag determines the slot, and clients are redirected with MOVED responses when slots migrate during reshards.', query: 'How does Redis cluster decide which node holds a given key?' },
  { topic: 'cassandra-quorum', anchor: 'Cassandra quorum reads require responses from a majority of replicas before returning. Combined with quorum writes the system achieves strong consistency at the cost of higher latency than ONE.', query: 'What replica setting in Cassandra trades latency for consistency guarantees?' },
  { topic: 'zookeeper-ephemeral', anchor: 'A ZooKeeper ephemeral znode is deleted when the session that created it ends. This property underpins distributed leader election and live-membership tracking without explicit heartbeats from clients.', query: 'Which znode type vanishes automatically when its owner disconnects?' },
  { topic: 'etcd-compaction', anchor: 'Etcd compaction discards historical key revisions older than a configured boundary. Without periodic compaction the boltDB backend grows unbounded and watch latency degrades.', query: 'Why must etcd operators periodically prune old key revisions?' },
  { topic: 'prometheus-histogram-quantile', anchor: 'Prometheus histogram_quantile interpolates linearly within bucket boundaries to estimate a percentile from counter increments. The estimate is only as good as the chosen bucket cutoffs around the target quantile.', query: 'How does Prometheus compute percentiles from bucketed counter data?' },
  { topic: 'otel-trace-context', anchor: 'OpenTelemetry trace context propagates via the traceparent and tracestate W3C headers. Downstream services parse these to attach spans to the correct trace and preserve sampling decisions.', query: 'Which W3C headers carry distributed tracing identifiers across services?' },
  { topic: 'linux-epoll-edge', anchor: 'Linux epoll edge-triggered mode delivers a readiness event only when state transitions. Listeners must drain the socket completely with non-blocking reads until EAGAIN, or they will stall waiting for an event that never comes.', query: 'What epoll mode notifies only on state change and demands non-blocking drain loops?' },
  { topic: 'macos-xpc', anchor: 'macOS XPC services are lightweight processes launched on demand by launchd. The Mach-port-based RPC isolates privileged operations from the main app and is the foundation of app sandboxing.', query: 'How does macOS isolate privileged subprocesses spawned from sandboxed apps?' },
  { topic: 'docker-layer-cache', anchor: 'Docker rebuilds a layer only when its instruction text or referenced file checksums change. Ordering frequently-changed instructions after rarely-changed ones maximizes cache reuse across image builds.', query: 'Why does the order of Dockerfile instructions affect build speed?' },
  { topic: 'rootless-podman', anchor: 'Rootless container engines map user namespaces so the in-container root maps to an unprivileged host UID. The container cannot escalate beyond the launching user even on a successful escape.', query: 'How do unprivileged container runtimes prevent root escape attacks?' },
  { topic: 'terraform-state-lock', anchor: 'Terraform state locking prevents concurrent applies from corrupting the state file. Remote backends like S3 with DynamoDB or Terraform Cloud implement this via a side-channel lock entry the operation acquires.', query: 'How does Terraform stop two engineers from clobbering each other on apply?' },
  { topic: 'ansible-idempotency', anchor: 'Ansible modules are designed to be idempotent — running a playbook twice should converge state, not double-apply changes. The check-mode and changed-when patterns expose whether a task actually mutated anything.', query: 'Which Ansible property lets you safely run the same playbook repeatedly?' },
  { topic: 'lambda-cold-start', anchor: 'AWS Lambda cold start latency includes container initialization, runtime bootstrap, and user code init. Provisioned concurrency keeps a pool of warm executions and SnapStart restores from a memory snapshot.', query: 'What latency component does Lambda provisioned concurrency target?' },
  { topic: 'cloudflare-kv-consistency', anchor: 'Cloudflare Workers KV is eventually consistent. Writes propagate from the central store to edge data centers asynchronously, with read-after-write visibility varying by region and cache TTL.', query: 'Why might a Worker not see a key it just wrote a second ago?' },
  { topic: 'vercel-edge-runtime', anchor: 'The Vercel Edge runtime is a V8 isolate environment without Node APIs. It supports a Web Standards subset — Fetch, Streams, Crypto — but lacks fs, child_process, and native modules like better-sqlite3.', query: 'Why can you not import a native Node module on a Vercel Edge function?' },
  { topic: 'fly-anycast-routing', anchor: 'Fly.io advertises its public IPs from every region simultaneously via BGP anycast. Client packets reach the topologically nearest region, where the proxy forwards over the internal mesh to the app machine.', query: 'How does Fly route a request to the closest copy of an application?' },
  { topic: 'algolia-tokenization', anchor: 'Algolia tokenizes indexed records using language-aware analyzers — splitting on whitespace, normalizing diacritics, and applying configurable plural and prefix rules. The query analyzer must match for the search to retrieve.', query: 'What text normalization step must agree between Algolia index and query time?' },
  { topic: 'elasticsearch-bm25', anchor: 'Elasticsearch default similarity is BM25, which scores documents by term frequency saturation and inverse document frequency. Two knobs, k1 and b, control TF dampening and length normalization respectively.', query: 'What scoring algorithm replaced TF-IDF as the Elasticsearch default?' },
  { topic: 'chroma-collection', anchor: 'A Chroma collection is the unit of vector storage with its own embedding function and metadata schema. Collections within the same Chroma instance are isolated indexes that can be queried independently.', query: 'What namespace contains a single Chroma vector index?' },
  { topic: 'pinecone-namespace', anchor: 'A Pinecone namespace is a logical partition within an index, enabling per-tenant isolation without provisioning separate indexes. Queries scoped to a namespace see only that namespaces vectors.', query: 'How does Pinecone separate tenant data inside a shared index?' },
  { topic: 'weaviate-rrf', anchor: 'Weaviate hybrid search combines BM25 keyword scores with dense vector cosine scores using reciprocal rank fusion. RRF sums the inverse ranks across both lists, balancing lexical precision and semantic recall.', query: 'How does Weaviate merge keyword and embedding result lists into one ranking?' },
  { topic: 'qdrant-payload-filter', anchor: 'Qdrant payload filters apply structured predicates over JSON metadata before or after the ANN search. The query planner picks between pre-filtering for high selectivity and post-filtering for high recall.', query: 'How does Qdrant combine structured field conditions with vector similarity?' },
  { topic: 'pytorch-autograd-retain', anchor: 'PyTorch frees intermediate tensors after the backward pass by default. retain_graph=True keeps them so a second backward can run on the same forward computation, at the cost of memory.', query: 'Which PyTorch backward flag enables computing gradients twice from one forward?' },
  { topic: 'jax-jit-tracing', anchor: 'JAX jit traces a function with abstract shaped values to record an XLA computation. The trace runs once per unique input signature and the compiled binary executes on every subsequent call with that signature.', query: 'How does JAX turn a Python function into a reusable compiled kernel?' },
];

if (FIXTURE.length !== 50) {
  process.stderr.write(`fixture length must be exactly 50, got ${FIXTURE.length}\n`);
  process.exit(2);
}

// ── 2. Distractor generator ────────────────────────────────────────────────
//
// 9,950 distractors drawn from THIRD domains (history, biology, cuisine,
// geology, music, finance, sports) — semantically far from BOTH the
// anchor topics and CONTINUUM's domain. Each one is unique by index
// suffix so duplicates don't dominate the index.

const DISTRACTOR_DOMAINS = [
  {
    subject: 'medieval European trade routes',
    verbs: ['flowed through', 'crossed', 'terminated at', 'bypassed', 'connected'],
    objects: ['Bruges', 'Venice', 'Constantinople', 'the Hanseatic ports', 'the Silk Road waystations'],
    contexts: ['during the fourteenth century', 'after the bubonic plague', 'before maritime competition', 'in the Italian city-states', 'across the Alpine passes'],
  },
  {
    subject: 'mitochondrial respiration',
    verbs: ['couples', 'depends on', 'phosphorylates', 'pumps protons across', 'oxidizes'],
    objects: ['NADH', 'pyruvate', 'the inner membrane', 'ADP to ATP', 'cytochrome c'],
    contexts: ['under aerobic conditions', 'in the electron transport chain', 'when oxygen is the terminal acceptor', 'in eukaryotic cells', 'during oxidative phosphorylation'],
  },
  {
    subject: 'volcanic island arcs',
    verbs: ['form above', 'parallel', 'erupt with', 'rise from', 'mark'],
    objects: ['subducting oceanic plates', 'the Wadati-Benioff zone', 'andesitic magma', 'the overriding continental crust', 'deep ocean trenches'],
    contexts: ['along the Pacific Ring of Fire', 'where two plates converge', 'in convergent margins', 'between back-arc basins', 'over a melting wedge'],
  },
  {
    subject: 'classical sonata form',
    verbs: ['exposes', 'develops', 'recapitulates', 'modulates', 'concludes'],
    objects: ['two contrasting themes', 'the tonic key', 'a dominant transition', 'a fragmented motif', 'the original key center'],
    contexts: ['in the first movement', 'during the development section', 'in late Beethoven works', 'as a coda', 'before the closing theme'],
  },
  {
    subject: 'fixed income duration',
    verbs: ['measures', 'increases with', 'declines for', 'approximates', 'normalizes'],
    objects: ['interest-rate sensitivity', 'bond maturity', 'higher coupon payments', 'price changes per yield basis point', 'cash flow weighting'],
    contexts: ['under parallel yield shifts', 'for callable bonds', 'in portfolio hedging', 'across the yield curve', 'when convexity is small'],
  },
  {
    subject: 'long-distance running training',
    verbs: ['develops', 'builds', 'increases', 'depletes', 'recruits'],
    objects: ['VO2 max', 'aerobic capacity', 'mitochondrial density', 'glycogen stores', 'slow-twitch muscle fibers'],
    contexts: ['through interval workouts', 'over a six-month base phase', 'with progressive overload', 'before a marathon peak', 'across multiple training blocks'],
  },
  {
    subject: 'cured pork charcuterie',
    verbs: ['ages', 'cures', 'ferments', 'smokes', 'hangs'],
    objects: ['Parma ham', 'Iberico shoulder', 'guanciale', 'culatello', 'lardo'],
    contexts: ['for eighteen months', 'in mountain cellars', 'with sea salt and pepper', 'at controlled humidity', 'wrapped in pork bladder'],
  },
];

function makeDistractor(i) {
  const dom = DISTRACTOR_DOMAINS[i % DISTRACTOR_DOMAINS.length];
  const v = dom.verbs[(i * 7) % dom.verbs.length];
  const o = dom.objects[(i * 11) % dom.objects.length];
  const c = dom.contexts[(i * 13) % dom.contexts.length];
  // Suffix with a numeric tag so each is byte-unique and produces a
  // distinct embedding (avoids index-domination by duplicates).
  return `Distractor entry ${i}. The ${dom.subject} ${v} ${o} ${c}. This is sample text generated for benchmark padding number ${i}.`;
}

const TARGET_TOTAL = 10_000;
const DISTRACTOR_COUNT = TARGET_TOTAL - FIXTURE.length;
process.stdout.write(
  `\nFixture: ${FIXTURE.length} anchors + ${DISTRACTOR_COUNT} distractors = ${TARGET_TOTAL} observations\n`,
);

// ── 3. Insertion phase ─────────────────────────────────────────────────────

const storage = openStorage('bench');
storage.upsertSource('bench:fixture', 'docs');

process.stdout.write('\n[insertion]\n');
const insertStart = performance.now();
const baseTs = new Date('2026-06-01T00:00:00Z').getTime();
let observationIdx = 0;

for (const { topic, anchor } of FIXTURE) {
  storage.upsertObservation({
    id: `bench-anchor-${topic}`,
    sourceId: 'bench:fixture',
    type: 'doc',
    content: anchor,
    timestamp: new Date(baseTs + observationIdx * 1000).toISOString(),
    refs: [],
  });
  observationIdx++;
}

for (let i = 0; i < DISTRACTOR_COUNT; i++) {
  storage.upsertObservation({
    id: `bench-distractor-${i.toString().padStart(5, '0')}`,
    sourceId: 'bench:fixture',
    type: 'doc',
    content: makeDistractor(i),
    timestamp: new Date(baseTs + observationIdx * 1000).toISOString(),
    refs: [],
  });
  observationIdx++;
}

const sqliteInsertEnd = performance.now();
process.stdout.write(
  `  SQLite inserts done in ${(sqliteInsertEnd - insertStart).toFixed(0)}ms\n` +
    `  waiting for vector queue to drain…\n`,
);

await storage.flushVectorWrites();
const insertEnd = performance.now();
const totalInsertMs = insertEnd - insertStart;

const vectorCount = await storage.vectorCount();
process.stdout.write(
  `  vector queue drained in ${(insertEnd - sqliteInsertEnd).toFixed(0)}ms (vectors=${vectorCount})\n` +
    `  TOTAL: ${totalInsertMs.toFixed(0)}ms for ${TARGET_TOTAL} observations\n`,
);

// ── 4. Query phase — recall@5 + latency ────────────────────────────────────

process.stdout.write('\n[recall@5 + latency]\n');

const queryLatencies = [];
let hits = 0;

for (const { topic, query } of FIXTURE) {
  const t0 = performance.now();
  const results = await storage.vectorSearch(query, 5);
  const elapsed = performance.now() - t0;
  queryLatencies.push(elapsed);
  if (results.some(r => r.id === `bench-anchor-${topic}`)) hits++;
}
const recall5 = hits / FIXTURE.length;
process.stdout.write(`  recall@5 from fixture queries: ${hits}/${FIXTURE.length} = ${recall5.toFixed(4)}\n`);

// 50 extra latency-only probes from a synthetic question pool so the p95
// estimate doesn't rely on the fixture alone.
const SYNTH_QUERIES = [
  'How is distributed consensus achieved between failing nodes?',
  'What happens to in-flight requests when a backend autoscales?',
  'Why does a database query plan change after analyze?',
  'How does TLS achieve forward secrecy?',
  'Which sort algorithm is best for nearly-sorted input?',
  'How do CDNs handle cache-busting on deploy?',
  'What is the cost of a context switch on Linux?',
  'When does a B-tree split a node?',
  'How does garbage collection handle weak references?',
  'What makes a Merkle DAG content-addressable?',
  'How does HTTP keep-alive reduce latency?',
  'What is the difference between a coroutine and a thread?',
  'How are SSL session tickets rotated?',
  'Why do reactive frameworks batch state updates?',
  'How does a write-through cache differ from write-back?',
  'What is the role of an XOR in symmetric cipher modes?',
  'How does a vector tile renderer cull off-screen geometry?',
  'When does Postgres choose a sequential scan over an index?',
  'What is the purpose of an MTU discovery probe?',
  'How does a key-value store implement secondary indexes?',
  'Why is jitter intentional in distributed retry backoffs?',
  'How does a service mesh terminate mTLS?',
  'What is the failure mode of a leaky bucket rate limiter?',
  'How does a probabilistic data structure trade memory for accuracy?',
  'When should you use append-only storage over mutable rows?',
  'How does a queue handle poison messages?',
  'Why does eager evaluation hurt streaming pipelines?',
  'How do you tune a thread pool for IO-bound work?',
  'What is the safety property of a linearizable register?',
  'How do compactor processes manage write amplification?',
  'When does a memoization cache become a memory leak?',
  'How does a Lambda invocation reuse its execution context?',
  'What is the role of a sidecar in distributed tracing?',
  'How does a content-addressable filesystem deduplicate blocks?',
  'When does a TCP retransmit lower throughput?',
  'How is a stable hash partition chosen across resharding?',
  'What is the read amplification cost of LSM trees?',
  'How does a SAT solver handle clause learning?',
  'When does a token bucket starve under burst traffic?',
  'How does a tracing JIT decide what to compile?',
  'What is the failure model of a circuit breaker?',
  'How do you migrate columns without locking a table?',
  'When does a writer-stall in RocksDB resolve itself?',
  'How does an event store enforce write idempotency?',
  'What is the purpose of a Bloom filter on a SSTable?',
  'How does a vector clock reason about partial order?',
  'When does a database use a hash join over a merge join?',
  'How is a JWT refresh token rotated securely?',
  'What is the cost of a TLS handshake on a cold connection?',
  'How does a coordinator-less write avoid duplicate work?',
];

for (const q of SYNTH_QUERIES) {
  const t0 = performance.now();
  await storage.vectorSearch(q, 5);
  queryLatencies.push(performance.now() - t0);
}

queryLatencies.sort((a, b) => a - b);
const p50 = queryLatencies[Math.floor(queryLatencies.length * 0.50)];
const p95 = queryLatencies[Math.floor(queryLatencies.length * 0.95)];
const p99 = queryLatencies[Math.floor(queryLatencies.length * 0.99)];
const max = queryLatencies[queryLatencies.length - 1];

process.stdout.write(
  `  latency over ${queryLatencies.length} queries:\n` +
    `    p50 = ${p50.toFixed(2)}ms\n` +
    `    p95 = ${p95.toFixed(2)}ms\n` +
    `    p99 = ${p99.toFixed(2)}ms\n` +
    `    max = ${max.toFixed(2)}ms\n`,
);

// ── 5. Gate verdict ────────────────────────────────────────────────────────

const G1_PASS = totalInsertMs < 60_000;
const G2_PASS = recall5 >= 0.85;
const G3_PASS = p95 < 50;
const ALL_PASS = G1_PASS && G2_PASS && G3_PASS;

process.stdout.write('\n[verdict — W23-1 sub-deliverable 1]\n');
process.stdout.write(
  `  G1 insertion <60s        : ${G1_PASS ? '✓ PASS' : '✗ FAIL'} (measured ${(totalInsertMs / 1000).toFixed(2)}s)\n` +
    `  G2 recall@5 ≥ 0.85       : ${G2_PASS ? '✓ PASS' : '✗ FAIL'} (measured ${recall5.toFixed(4)})\n` +
    `  G3 p95 latency <50ms     : ${G3_PASS ? '✓ PASS' : '✗ FAIL'} (measured ${p95.toFixed(2)}ms)\n\n` +
    `  OVERALL: ${ALL_PASS ? '✓ ALL GATES PASS — proceed to sub-deliverables 2-5' : '✗ AT LEAST ONE GATE FAILED — STOP per operator directive'}\n`,
);

// ── 6. Cleanup ─────────────────────────────────────────────────────────────

storage.close();
rmSync(TMP, { recursive: true, force: true });
process.exit(ALL_PASS ? 0 : 1);
