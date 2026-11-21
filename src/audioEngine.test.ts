import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from './audioEngine';
import {
  getAccentBeats,
  getBeatsPerBar,
  type BeatInfo,
  type Song,
  type TimeSignature,
} from './types';

/*
 * The engine runs against a fake AudioContext whose clock is the fake timer
 * clock, so "audio time" and "JS timer time" advance together and every
 * scheduled start time can be checked exactly.
 */

const env = vi.hoisted(() => ({
  platform: 'ios',
  baseLatency: 0,
  outputLatency: 0,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => env.platform },
}));
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: () => Promise.resolve(),
    allowSleep: () => Promise.resolve(),
  },
}));
vi.mock('./cueAudio', () => ({
  preloadAllCueBuffers: () => Promise.resolve(),
  getCueBuffer: (word: string) => ({ kind: 'cue', word }),
}));

type Sound = { kind: 'accent' | 'click' | 'cue'; word?: string };
interface Played extends Sound {
  /** When the sound is due on the audio clock. */
  time: number;
  /** Audio clock when it was handed to Web Audio. */
  scheduledAt: number;
}

let played: Played[] = [];
let ctx: FakeAudioContext;

class FakeAudioContext {
  sampleRate = 48000;
  baseLatency = env.baseLatency;
  outputLatency = env.outputLatency;
  destination = {};
  private t0 = Date.now();
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    ctx = this;
  }
  get currentTime() {
    return (Date.now() - this.t0) / 1000;
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
  createBufferSource() {
    const src = {
      buffer: null as Sound | null,
      connect() {},
      start: (time: number) =>
        played.push({ ...src.buffer!, time, scheduledAt: this.currentTime }),
    };
    return src;
  }
}

/** Renders the click buffers; tags them by pitch so tests can tell them apart. */
class FakeOfflineAudioContext {
  destination = {};
  private osc = { frequency: { value: 0 }, type: '', connect() {}, start() {}, stop() {} };
  createOscillator() {
    return this.osc;
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    };
  }
  startRendering(): Promise<Sound> {
    return Promise.resolve({
      kind: this.osc.frequency.value === 1000 ? 'accent' : 'click',
    });
  }
}

/** Imports a fresh engine (the platform is read once, at import). */
async function loadEngine(platform: 'ios' | 'android') {
  env.platform = platform;
  vi.resetModules();
  return (await import('./audioEngine')).AudioEngine;
}

function makeSong(
  timeSignature: TimeSignature,
  bpm: number,
  sections: Song['sections']
): Song {
  return { id: 'song', name: 'Test', bpm, timeSignature, sections };
}

async function play(Engine: typeof AudioEngine, song: Song) {
  const engine = new Engine();
  const beats: { info: BeatInfo; heardAt: number }[] = [];
  const finishes: number[] = [];
  engine.setCallbacks(
    (info) => beats.push({ info, heardAt: ctx.currentTime }),
    () => finishes.push(ctx.currentTime)
  );
  await engine.start(song);
  return { engine, beats, finishes };
}

const totalBeats = (song: Song) =>
  song.sections.reduce((n, s) => n + s.bars, 0) *
  getBeatsPerBar(song.timeSignature);

const songSeconds = (song: Song) => (totalBeats(song) * 60) / song.bpm;

const clicks = () => played.filter((p) => p.kind !== 'cue');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
  played = [];
  env.baseLatency = 0;
  env.outputLatency = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('click timing', () => {
  it.each<[TimeSignature, number]>([
    ['4/4', 40],
    ['4/4', 120],
    ['4/4', 300],
    ['3/4', 97],
    ['7/8', 220],
    ['12/8', 180],
  ])('%s at %i BPM: every click exactly 60/BPM apart, no drift', async (ts, bpm) => {
    const AudioEngine = await loadEngine('ios');
    const song = makeSong(ts, bpm, [
      { name: 'A', bars: 3 },
      { name: 'B', bars: 2 },
    ]);
    await play(AudioEngine, song);
    vi.advanceTimersByTime(songSeconds(song) * 1000 + 1000);

    const times = clicks().map((c) => c.time);
    expect(times).toHaveLength(totalBeats(song));
    const spb = 60 / bpm;
    expect(times[0]).toBeCloseTo(0.05, 9);
    times.forEach((t, i) => expect(t).toBeCloseTo(0.05 + i * spb, 9));
  });

  it('stays exact over a long song (200 bars at 137 BPM)', async () => {
    const AudioEngine = await loadEngine('ios');
    const song = makeSong('4/4', 137, [{ name: 'A', bars: 200 }]);
    await play(AudioEngine, song);
    vi.advanceTimersByTime(songSeconds(song) * 1000 + 1000);

    const times = clicks().map((c) => c.time);
    expect(times).toHaveLength(800);
    // Accumulated float error after 800 beats stays far below a sample.
    expect(Math.abs(times[799] - (0.05 + (799 * 60) / 137))).toBeLessThan(1e-9);
  });

  it('never schedules a click late when the main thread stalls 60 ms', async () => {
    const AudioEngine = await loadEngine('ios');
    const song = makeSong('4/4', 200, [{ name: 'A', bars: 8 }]);
    await play(AudioEngine, song);

    // Freeze JS (timers don't run) while the audio clock keeps going.
    for (let i = 0; i < 40; i++) {
      vi.setSystemTime(Date.now() + 60);
      vi.advanceTimersByTime(40);
    }
    vi.advanceTimersByTime(songSeconds(song) * 1000);

    const all = clicks();
    expect(all).toHaveLength(totalBeats(song));
    for (const c of all) expect(c.time).toBeGreaterThanOrEqual(c.scheduledAt);
    all.forEach((c, i) => expect(c.time).toBeCloseTo(0.05 + i * 0.3, 9));
  });

  it.each(['2/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'] as TimeSignature[])(
    '%s accents land on the meter’s group starts',
    async (ts) => {
      const AudioEngine = await loadEngine('ios');
      const song = makeSong(ts, 120, [{ name: 'A', bars: 2 }]);
      await play(AudioEngine, song);
      vi.advanceTimersByTime(songSeconds(song) * 1000 + 1000);

      const beats = getBeatsPerBar(ts);
      const accents = getAccentBeats(ts);
      clicks().forEach((c, i) =>
        expect(c.kind).toBe(accents.includes(i % beats) ? 'accent' : 'click')
      );
    }
  );
});

describe('cues', () => {
  it('speaks each cue word on its beat of the cue bar, in time with the click', async () => {
    const AudioEngine = await loadEngine('ios');
    const song = makeSong('4/4', 120, [
      { name: 'Verse', bars: 4, cue: { bar: 3, words: ['chorus', '-', '3', '4'] } },
      { name: 'Chorus', bars: 2 },
    ]);
    await play(AudioEngine, song);
    vi.advanceTimersByTime(songSeconds(song) * 1000 + 1000);

    const cues = played.filter((p) => p.kind === 'cue');
    const click = (bar: number, beat: number) =>
      clicks()[(bar - 1) * 4 + (beat - 1)].time;
    // '-' is a silent beat: click only.
    expect(cues.map((c) => c.word)).toEqual(['chorus', '3', '4']);
    expect(cues[0].time).toBe(click(3, 1));
    expect(cues[1].time).toBe(click(3, 3));
    expect(cues[2].time).toBe(click(3, 4));
  });

  it('reports position and cue word for every beat', async () => {
    const AudioEngine = await loadEngine('ios');
    const song = makeSong('3/4', 180, [
      { name: 'Intro', bars: 1 },
      { name: 'Verse', bars: 2, cue: { bar: 2, words: ['verse', '-', '3'] } },
    ]);
    const { beats } = await play(AudioEngine, song);
    vi.advanceTimersByTime(songSeconds(song) * 1000 + 1000);

    expect(
      beats.map(({ info }) =>
        [info.sectionName, info.bar, info.beat, info.isAccent, info.cueWord ?? ''].join(' ')
      )
    ).toEqual([
      'Intro 1 1 true ',
      'Intro 1 2 false ',
      'Intro 1 3 false ',
      'Verse 1 1 true ',
      'Verse 1 2 false ',
      'Verse 1 3 false ',
      'Verse 2 1 true verse',
      'Verse 2 2 false ',
      'Verse 2 3 false 3',
    ]);
    expect(beats.every(({ info }) => info.totalBeats === 3)).toBe(true);
  });
});

describe('UI sync (beat lights)', () => {
  beforeEach(() => {
    env.baseLatency = 0.012;
    env.outputLatency = 0.085;
  });

  it('iOS: lights fire exactly when each click is due', async () => {
    const AudioEngine = await loadEngine('ios');
    const song = makeSong('4/4', 150, [{ name: 'A', bars: 4 }]);
    const { beats } = await play(AudioEngine, song);
    vi.advanceTimersByTime(songSeconds(song) * 1000 + 1000);

    const times = clicks().map((c) => c.time);
    expect(beats).toHaveLength(times.length);
    beats.forEach((b, i) => expect(Math.abs(b.heardAt - times[i])).toBeLessThan(0.0015));
  });

  it('Android: lights wait for the output latency so they match the sound', async () => {
    const AudioEngine = await loadEngine('android');
    const song = makeSong('4/4', 150, [{ name: 'A', bars: 4 }]);
    const { beats } = await play(AudioEngine, song);
    vi.advanceTimersByTime(songSeconds(song) * 1000 + 1000);

    const times = clicks().map((c) => c.time);
    expect(beats).toHaveLength(times.length);
    // Sound timing itself is untouched; only the lights are delayed.
    times.forEach((t, i) => expect(t).toBeCloseTo(0.05 + i * 0.4, 9));
    beats.forEach((b, i) =>
      expect(Math.abs(b.heardAt - (times[i] + 0.097))).toBeLessThan(0.0015)
    );
  });

  it('Android: ignores a nonsense latency reading', async () => {
    env.outputLatency = Number.POSITIVE_INFINITY;
    const AudioEngine = await loadEngine('android');
    const song = makeSong('4/4', 120, [{ name: 'A', bars: 1 }]);
    const { beats } = await play(AudioEngine, song);
    vi.advanceTimersByTime(3000);

    const times = clicks().map((c) => c.time);
    beats.forEach((b, i) => expect(Math.abs(b.heardAt - times[i])).toBeLessThan(0.0015));
  });
});

describe('start, stop and finish', () => {
  it.each(['ios', 'android'] as const)(
    '%s: finishes once, after the last beat is shown',
    async (platform) => {
      env.outputLatency = 0.2;
      const AudioEngine = await loadEngine(platform);
      const song = makeSong('4/4', 120, [{ name: 'A', bars: 2 }]);
      const { engine, beats, finishes } = await play(AudioEngine, song);
      vi.advanceTimersByTime(songSeconds(song) * 1000 + 2000);

      expect(beats).toHaveLength(8);
      expect(finishes).toHaveLength(1);
      expect(finishes[0]).toBeGreaterThanOrEqual(beats[7].heardAt);
      expect(engine.isPlaying).toBe(false);
    }
  );

  it('stop() silences everything, including lights already queued', async () => {
    const AudioEngine = await loadEngine('android');
    const song = makeSong('4/4', 120, [{ name: 'A', bars: 16 }]);
    const { engine, beats, finishes } = await play(AudioEngine, song);
    vi.advanceTimersByTime(1000);
    engine.stop();
    const playedAtStop = played.length;
    const beatsAtStop = beats.length;

    vi.advanceTimersByTime(songSeconds(song) * 1000);
    expect(engine.isPlaying).toBe(false);
    expect(played).toHaveLength(playedAtStop);
    expect(beats).toHaveLength(beatsAtStop);
    expect(finishes).toHaveLength(0);
  });

  it('restarting drops callbacks from the previous run', async () => {
    const AudioEngine = await loadEngine('android');
    env.outputLatency = 0.25;
    const engine = new AudioEngine();
    const names: string[] = [];
    engine.setCallbacks(
      (info) => names.push(info.sectionName),
      () => {}
    );
    await engine.start(makeSong('4/4', 240, [{ name: 'Old', bars: 8 }]));
    vi.advanceTimersByTime(500);
    const oldCount = names.length;

    await engine.start(makeSong('4/4', 240, [{ name: 'New', bars: 1 }]));
    vi.advanceTimersByTime(3000);
    expect(names.slice(oldCount).every((n) => n === 'New')).toBe(true);
    expect(names.filter((n) => n === 'New')).toHaveLength(4);
  });

  it('plays an unknown time signature as 4/4 instead of crashing', async () => {
    const AudioEngine = await loadEngine('ios');
    const song = makeSong('11/16' as TimeSignature, 120, [{ name: 'A', bars: 2 }]);
    const { beats } = await play(AudioEngine, song);
    vi.advanceTimersByTime(6000);
    expect(beats).toHaveLength(8);
  });
});
