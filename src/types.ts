/**
 * Supported meters. In every meter one click = one beat of the denominator
 * (quarter note for x/4, eighth note for x/8), and BPM counts those clicks.
 */
export const TIME_SIGNATURES = [
  '2/4', '3/4', '4/4', '5/4', '5/8', '6/8', '7/8', '9/8', '12/8',
] as const;

export type TimeSignature = (typeof TIME_SIGNATURES)[number];

interface Meter {
  beats: number;
  /** Beat indices (0-based) that get the accented click: group starts. */
  accents: number[];
  /** How the bar is felt, e.g. "2+2+3". Omitted for simple meters. */
  grouping?: string;
}

const METERS: Record<TimeSignature, Meter> = {
  '2/4': { beats: 2, accents: [0] },
  '3/4': { beats: 3, accents: [0] },
  '4/4': { beats: 4, accents: [0] },
  '5/4': { beats: 5, accents: [0, 3], grouping: '3+2' },
  '5/8': { beats: 5, accents: [0, 3], grouping: '3+2' },
  '6/8': { beats: 6, accents: [0, 3], grouping: '3+3' },
  '7/8': { beats: 7, accents: [0, 2, 4], grouping: '2+2+3' },
  '9/8': { beats: 9, accents: [0, 3, 6], grouping: '3+3+3' },
  '12/8': { beats: 12, accents: [0, 3, 6, 9], grouping: '3+3+3+3' },
};

// Songs synced from older clients or edited elsewhere may carry an unknown
// meter; fall back to 4/4 rather than crash the player.
function meter(ts: string): Meter {
  return METERS[ts as TimeSignature] ?? METERS['4/4'];
}

export function getGrouping(ts: TimeSignature): string | undefined {
  return meter(ts).grouping;
}

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
  return meter(ts).beats;
}

export function getAccentBeats(ts: TimeSignature): number[] {
  return meter(ts).accents;
}

/** Cue word meaning "click only, no voice" on that beat. */
export const SILENT_CUE = '-';

/**
 * Default cue for a meter: the voice word on beat 1, then counts. Up to 6
 * beats every beat is counted; longer bars count only the main pulses
 * ("verse - - 2 - - 3 - -" in 9/8), which is how they are felt and keeps
 * within the recorded numbers 1-6.
 */
export function defaultCueWords(ts: TimeSignature, voice = 'verse'): string[] {
  const { beats, accents } = meter(ts);
  const pulses = beats <= 6 ? [...Array(beats).keys()] : accents;
  const words: string[] = Array(beats).fill(SILENT_CUE);
  pulses.forEach((beat, i) => {
    words[beat] = i === 0 ? voice : String(Math.min(i + 1, 6));
  });
  return words;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
