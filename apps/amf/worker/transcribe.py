#!/usr/bin/env python3
"""
transcribe.py — L3 hook-finder: long-form walk-and-talk → timestamped transcript.

Transcribes any audio/video (whisper base, CPU) and prints [start-end] segments so
a human or agent can pick 30-45s hooks to cut into shorts. The content engine's
long-form → short-form entry point. Handles .mp4/.wav/.mov/etc (ffmpeg normalises).

  python3 transcribe.py <audio-or-video-file>

IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
"""
import os, sys, subprocess, tempfile
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except Exception:
    pass
import whisperx  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python3 transcribe.py <audio-or-video-file>", file=sys.stderr)
        return 2
    src = sys.argv[1]
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(["ffmpeg", "-y", "-i", src, "-ar", "16000", "-ac", "1", tmp], check=True, capture_output=True)
    model = whisperx.load_model("base", "cpu", compute_type="int8", language=os.environ.get("AMF_LANG", "en"))
    audio = whisperx.load_audio(tmp)
    result = model.transcribe(audio, batch_size=16)
    for s in result["segments"]:
        print(f"[{s['start']:7.1f}-{s['end']:7.1f}] {s['text'].strip()}")
    os.unlink(tmp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
