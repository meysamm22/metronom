import { describe, expect, it } from 'vitest';
import {
  TIME_SIGNATURES,
  SILENT_CUE,
  defaultCueWords,
  getAccentBeats,
  getBeatsPerBar,
  getGrouping,
  type TimeSignature,
} from './types';
import { CUE_WORDS } from './cueAudio';
import { demoSongs } from './demoSongs';

const playable = new Set<string>([...CUE_WORDS, SILENT_CUE]);

describe('time signatures', () => {
  it.each(TIME_SIGNATURES)('%s has one click per beat of the numerator', (ts) => {
    expect(getBeatsPerBar(ts)).toBe(Number(ts.split('/')[0]));
  });

  it.each(TIME_SIGNATURES)('%s accents start on beat 1 and stay inside the bar', (ts) => {
    const accents = getAccentBeats(ts);
    expect(accents[0]).toBe(0);
    expect([...accents].sort((a, b) => a - b)).toEqual(accents);
    expect(new Set(accents).size).toBe(accents.length);
    expect(Math.max(...accents)).toBeLessThan(getBeatsPerBar(ts));
  });

  it.each(TIME_SIGNATURES)('%s grouping matches its accents', (ts) => {
    const grouping = getGrouping(ts);
    if (!grouping) {
      // Simple meters: one accent on the downbeat.
      expect(getAccentBeats(ts)).toEqual([0]);
      return;
    }
    const groups = grouping.split('+').map(Number);
    expect(groups.reduce((a, b) => a + b, 0)).toBe(getBeatsPerBar(ts));
    // Each group starts on an accent.
    const starts = groups.map((_, i) => groups.slice(0, i).reduce((a, b) => a + b, 0));
    expect(starts).toEqual(getAccentBeats(ts));
  });

  it('falls back to 4/4 for a meter from an older or unknown client', () => {
    const unknown = '11/16' as TimeSignature;
    expect(getBeatsPerBar(unknown)).toBe(4);
    expect(getAccentBeats(unknown)).toEqual([0]);
    expect(getGrouping(unknown)).toBeUndefined();
  });
});

describe('defaultCueWords', () => {
  it.each<[TimeSignature, string]>([
    ['2/4', 'verse 2'],
    ['3/4', 'verse 2 3'],
    ['4/4', 'verse 2 3 4'],
    ['5/4', 'verse 2 3 4 5'],
    ['5/8', 'verse 2 3 4 5'],
    ['6/8', 'verse 2 3 4 5 6'],
    // Long bars count the felt pulses only.
    ['7/8', 'verse - 2 - 3 - -'],
    ['9/8', 'verse - - 2 - - 3 - -'],
    ['12/8', 'verse - - 2 - - 3 - - 4 - -'],
  ])('%s → %s', (ts, expected) => {
    expect(defaultCueWords(ts).join(' ')).toBe(expected);
  });

  it.each(TIME_SIGNATURES)('%s has one word per beat, all with recorded audio', (ts) => {
    const words = defaultCueWords(ts, 'chorus');
    expect(words).toHaveLength(getBeatsPerBar(ts));
    expect(words[0]).toBe('chorus');
    for (const w of words) expect(playable).toContain(w);
  });
});

describe('demo songs', () => {
  it.each(demoSongs.map((s) => [s.name, s] as const))('%s is playable', (_, song) => {
    expect(TIME_SIGNATURES).toContain(song.timeSignature);
    expect(song.bpm).toBeGreaterThanOrEqual(20);
    expect(song.bpm).toBeLessThanOrEqual(300);
    expect(song.sections.length).toBeGreaterThan(0);
    for (const section of song.sections) {
      expect(section.bars).toBeGreaterThan(0);
      if (!section.cue) continue;
      expect(section.cue.bar).toBeGreaterThanOrEqual(1);
      expect(section.cue.bar).toBeLessThanOrEqual(section.bars);
      expect(section.cue.words).toHaveLength(getBeatsPerBar(song.timeSignature));
      for (const w of section.cue.words) expect(playable).toContain(w);
    }
  });
});
