/**
 * The L4-audio → L5-assembly data contract (AMF).
 *
 * This is the stable payload L5 (HyperFrames / FFmpeg) consumes. `segments`
 * (Auphonic, segment-level) is always present; `words` (forced-alignment,
 * word-level) is populated when available, with `wordLevelSource` recording
 * its provenance honestly so L5 knows whether it has true word timing.
 */
export interface WordTiming {
  word: string;
  start: number; // seconds
  end: number;
}

export interface SegmentTiming {
  text: string;
  start: number;
  end: number;
}

export type WordLevelSource = 'whisperx' | 'auphonic' | 'none';

export interface L5AudioPayload {
  jobId: string;
  enhancedAudioUrl: string;
  durationSec: number;
  transcript: string;
  segments: SegmentTiming[];
  words: WordTiming[];
  wordLevelSource: WordLevelSource;
  status: 'enhancing' | 'aligning' | 'ready-for-assembly' | 'error';
}
