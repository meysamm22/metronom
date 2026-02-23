export type TimeSignature = '4/4' | '3/4' | '6/8';

export interface CueConfig {
  /** 1-indexed bar number within the section where cue plays */
  bar: number;
  /** One word per beat, spoken/displayed on each beat of the cue bar */
  words: string[];
}

export interface Section {
  name: string;
  bars: number;
  cue?: CueConfig;
}

export interface Song {
  id: string;
  name: string;
  bpm: number;
  timeSignature: TimeSignature;
  sections: Section[];
}

export interface BeatInfo {
  sectionIndex: number;
  sectionName: string;
  bar: number;
  totalBars: number;
  beat: number;
  totalBeats: number;
  isAccent: boolean;
  cueWord?: string;
}

export function getBeatsPerBar(ts: TimeSignature): number {
  switch (ts) {
    case '4/4': return 4;
    case '3/4': return 3;
    case '6/8': return 6;
  }
}

export function getAccentBeats(ts: TimeSignature): number[] {
  switch (ts) {
    case '4/4': return [0];
    case '3/4': return [0];
    case '6/8': return [0, 3];
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
