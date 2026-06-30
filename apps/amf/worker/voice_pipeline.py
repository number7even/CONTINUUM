#!/usr/bin/env python3
"""
AMF L4 voice stage — synthesize narration + extract word-level timestamps.

Pipeline:  script text  ->  VoxCPM (TTS, Apache-2.0, MPS/CPU/GPU)  ->  audio.wav
                        ->  whisperx (align, Apache-2.0)            ->  word timings
                        ->  emit L5 payload JSON {audio, words[], segments[]}

This is the OWN-stack AI-voice path (no Rapida, no paid API, no GPL). VoxCPM
gives audio only; whisperx closes the word-timestamp gap that L5 caption/B-roll
sync needs. Runs on the M1 Mac worker (Apple Silicon MPS) — no cloud GPU.

Per-project voice: pass --voice-ref (a reference clip) to clone a brand voice
per tenant (VoxCPM controllable cloning).

Usage:
  python voice_pipeline.py --text "..." --out ./out --device mps [--voice-ref ref.wav]
  python voice_pipeline.py --text-file script.txt --out ./out

Emits:  <out>/audio.wav  and  <out>/payload.json  (the L4->L5 contract).

NOTE (P4): exact VoxCPM / whisperx call signatures are pinned to their current
APIs below; first run on the worker verifies model ids + align output shape.
Requirements: see requirements.txt. Python >=3.10, torch >=2.5.
"""
import argparse
import json
import os
import sys
from pathlib import Path


def synthesize(text: str, out_wav: Path, device: str, voice_ref: str | None) -> float:
    """TTS → wav. Returns duration in seconds.

    Engine via AMF_TTS env: 'supertonic' (default — 99M ONNX, light, 44.1kHz,
    fits 16GB) or 'voxcpm' (2B PyTorch, high-end, needs a dedicated machine).
    """
    engine = os.environ.get("AMF_TTS", "supertonic").lower()
    if engine == "voxcpm":
        return _synth_voxcpm(text, out_wav, device, voice_ref)
    return _synth_supertonic(text, out_wav, voice_ref)


def _synth_supertonic(text: str, out_wav: Path, voice_ref: str | None) -> float:
    """Supertonic 3 — 99M ONNX, on-device, 44.1kHz 16-bit. Apache-friendly, no GPU."""
    from supertonic import TTS  # type: ignore

    tts = TTS(auto_download=True)
    voice = os.environ.get("AMF_VOICE", "M1")  # preset voice style (per-project later)
    style = tts.get_voice_style(voice_name=voice)
    lang = os.environ.get("AMF_LANG", "en")
    wav, _duration = tts.synthesize(text=text, lang=lang, voice_style=style, total_steps=8, speed=1.05)
    tts.save_audio(wav, str(out_wav))
    import soundfile as sf  # type: ignore
    info = sf.info(str(out_wav))
    return float(info.frames) / float(info.samplerate)


def _synth_voxcpm(text: str, out_wav: Path, device: str, voice_ref: str | None) -> float:
    """VoxCPM2 — 2B PyTorch, high-end. OOM-heavy: run on a dedicated 16GB+ machine."""
    from voxcpm import VoxCPM  # type: ignore
    import soundfile as sf  # type: ignore

    model_id = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")
    model = VoxCPM.from_pretrained(model_id, device=None if device == "auto" else device)
    kwargs = {}
    if voice_ref:
        kwargs["prompt_wav_path"] = voice_ref  # controllable cloning
    wav = model.generate(text=text, normalize=True, **kwargs)
    sr = int(getattr(getattr(model, "tts_model", None), "sample_rate", 16000) or 16000)
    sf.write(str(out_wav), wav, sr)
    info = sf.info(str(out_wav))
    return float(info.frames) / float(info.samplerate)


def align(audio_path: Path, device: str):
    """whisperx transcribe + align → word-level timings.

    whisperx (ctranslate2/faster-whisper) supports only cpu/cuda, NOT mps. On
    Apple Silicon we therefore run alignment on CPU (fast enough for short clips)
    even when VoxCPM synthesized on mps.
    """
    import whisperx  # type: ignore

    asr_device = "cpu" if device == "mps" else device
    # Force the language (we know it — the script is ours). Auto-detect mis-fires
    # on short clean TTS audio (e.g. detects 'la'/Latin). LANG env overrides.
    lang = os.environ.get("AMF_LANG", "en")
    asr = whisperx.load_model(os.environ.get("WHISPER_MODEL", "base"), asr_device, compute_type="int8", language=lang)
    audio = whisperx.load_audio(str(audio_path))
    result = asr.transcribe(audio, batch_size=8)
    align_model, metadata = whisperx.load_align_model(language_code=lang, device=asr_device)
    aligned = whisperx.align(result["segments"], align_model, metadata, audio, asr_device, return_char_alignments=False)

    words = []
    for w in aligned.get("word_segments", []):
        if "start" in w and "end" in w and w.get("word"):
            words.append({"word": w["word"].strip(), "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3)})
    segments = []
    for s in aligned.get("segments", []):
        if "start" in s and "end" in s:
            segments.append({"text": s.get("text", "").strip(), "start": round(float(s["start"]), 3), "end": round(float(s["end"]), 3)})
    transcript = " ".join(s["text"] for s in segments).strip()
    return words, segments, transcript


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text")
    ap.add_argument("--text-file")
    ap.add_argument("--align-audio", default=None,
                    help="ALIGN-ONLY: whisperx an EXISTING audio file (a human recording) → "
                         "word timings; skips synthesis. The human-voice content path.")
    ap.add_argument("--out", default="./out")
    ap.add_argument("--device", default="mps", choices=["mps", "cpu", "cuda"])
    ap.add_argument("--voice-ref", default=None)
    ap.add_argument("--job-id", default="job_local")
    args = ap.parse_args()

    # ── Align-only path: a human voice recording → real per-word timing ──────────
    # No TTS. Used by produce-short.mjs when AMF_VOICE is a real recording. Duration
    # via stdlib `wave` (no soundfile dep). whisperx is the only heavy import here.
    if args.align_audio:
        audio_wav = Path(args.align_audio)
        if not audio_wav.exists():
            print(f"error: --align-audio file not found: {audio_wav}", file=sys.stderr)
            return 2
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        print("[L4] aligning human recording (whisperx, align-only)…", file=sys.stderr)
        words, segments, transcript = align(audio_wav, args.device)
        import wave as _wave
        try:
            with _wave.open(str(audio_wav), "rb") as wf:
                duration = wf.getnframes() / float(wf.getframerate() or 1)
        except Exception:
            duration = float(words[-1]["end"]) if words else 0.0
        payload = {
            "jobId": args.job_id,
            "enhancedAudioUrl": str(audio_wav),
            "durationSec": round(duration, 2),
            "transcript": transcript,
            "segments": segments,
            "words": words,
            "wordLevelSource": "whisperx",
            "status": "ready-for-assembly",
        }
        payload_path = out / "payload.json"
        payload_path.write_text(json.dumps(payload, indent=2))
        print(f"[L4] {len(words)} words (whisperx) → {payload_path}", file=sys.stderr)
        print(str(payload_path))  # stdout = payload path (for the orchestrator)
        return 0

    text = args.text or (Path(args.text_file).read_text() if args.text_file else None)
    if not text or not text.strip():
        print("error: --text or --text-file required", file=sys.stderr)
        return 2

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    audio_wav = out / "audio.wav"

    print(f"[L4] synthesizing voice (VoxCPM, device={args.device})…", file=sys.stderr)
    duration = synthesize(text, audio_wav, args.device, args.voice_ref)
    print(f"[L4] audio {duration:.1f}s → {audio_wav}", file=sys.stderr)

    print(f"[L4] aligning (whisperx)…", file=sys.stderr)
    words, segments, transcript = align(audio_wav, args.device)
    print(f"[L4] {len(words)} words, {len(segments)} segments", file=sys.stderr)

    payload = {
        "jobId": args.job_id,
        "enhancedAudioUrl": str(audio_wav),
        "durationSec": round(duration, 2),
        "transcript": transcript,
        "segments": segments,
        "words": words,
        "wordLevelSource": "whisperx",
        "status": "ready-for-assembly",
    }
    payload_path = out / "payload.json"
    payload_path.write_text(json.dumps(payload, indent=2))
    print(f"[L4] L5 payload → {payload_path}", file=sys.stderr)
    print(str(payload_path))  # stdout = the payload path, for the orchestrator
    return 0


if __name__ == "__main__":
    sys.exit(main())
