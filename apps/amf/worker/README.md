# AMF Producing Worker (L4 voice + L5 render)

The worker that turns a script into a **voiced, captioned 9:16 MP4** — entirely on
owned hardware (M1 Mac / Linux), entirely Apache/MIT, **no cloud GPU, no paid voice
API, no GPL**. This is the "factory floor" that runs on the Mac Mini worker.

```
script text
  └─ voice_pipeline.py
       ├─ VoxCPM (Apache-2.0)  → narration audio (30 langs, per-project voice clone)
       └─ whisperx (Apache-2.0) → word-level timestamps   ← closes the L5-sync gap
  └─ render.mjs
       └─ HyperFrames (CPU)    → deterministic MP4 (voice + karaoke captions, Inkwell brand)
```

## Why this stack (the verified decisions)
- **VoxCPM** for TTS — Apache-2.0, runs on Apple Silicon (MPS), 30 languages, voice
  cloning per project. It does NOT emit timestamps, so →
- **whisperx** for alignment — Apache-2.0, produces the word-level timing L5 needs.
- **HyperFrames** for assembly — CPU-only (headless Chrome + FFmpeg), no GPU.
- **NOT Rapida** — that's a real-time interactive-voice platform (L7), GPL-2.0 with
  branding; wrong shape for batch narration. See docs/ROADMAP_VISION.md.

## Setup (on the worker Mac, one time)
```bash
# Node 22 + FFmpeg (Homebrew)
brew install node@22 ffmpeg

# Python deps (Apple Silicon: torch uses MPS automatically)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
First run downloads the VoxCPM (~GB) + whisper models — once, cached after.

## Run
```bash
./run.sh "Valve just shipped a Linux gaming PC. And the people who should care most are not gamers."
# → out/<ts>/render/renders/*.mp4   (9:16, synthesized voice + word-synced captions)
```

Per-project brand voice: `voice_pipeline.py --voice-ref <reference.wav>` (VoxCPM
controllable cloning) — one reference clip per tenant.

## Where this fits
This is the worker stage. The full autopilot wraps it: `daily cron → per project →
L2 trend → L3 script (Claude) → THIS worker → AiToEarn publish (L5/L7)`. The
worker is wired to the job-state machine (apps/amf/lib/job.ts).

## Honest status
- Code: complete, ours, Apache/MIT.
- Proven independently: L5 render (a real 9:16 MP4, see docs/proof/).
- Not yet run end-to-end with real VoxCPM voice — that happens on first run on the
  M1 worker (model download). The render half is proven; the voice+align half runs
  against the pinned VoxCPM/whisperx APIs (verified on first run).
