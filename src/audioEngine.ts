import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import type { Song, BeatInfo } from './types';
import { getBeatsPerBar, getAccentBeats, SILENT_CUE } from './types';
import { preloadAllCueBuffers, getCueBuffer } from './cueAudio';
import { reportError, reportWarning } from './report';

/**
 * Safari 17+ / iOS WKWebView expose navigator.audioSession. Setting it to
 * 'playback' makes Web Audio ignore the ring/silent switch and keeps the
 * session alive with the screen locked.
 */
function requestPlaybackAudioSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      // Older WebKit: property exists but is read-only. Native AVAudioSession
      // config in the iOS app covers this case.
    }
  }
}

/**
 * Android's audio path adds a large, device-dependent delay between scheduling
 * a sound and hearing it (~30-150 ms on phones, far more on Bluetooth or the
 * emulator). iOS is ~5-10 ms, so it is left uncompensated.
 */
const COMPENSATE_OUTPUT_LATENCY = Capacitor.getPlatform() === 'android';

/**
 * One AudioContext for the whole app. iOS allows only a few at a time, and
 * the player screen is opened again for every song.
 */
let sharedCtx: AudioContext | null = null;
let clickAccentBuf: AudioBuffer | null = null;
let clickNormalBuf: AudioBuffer | null = null;

function audioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext();
    clickAccentBuf = clickNormalBuf = null;
  }
  return sharedCtx;
}

/** Cue words in the song whose recording failed to load. */
function missingCueWords(song: Song): string[] {
  const words = new Set(song.sections.flatMap((s) => s.cue?.words ?? []));
  return [...words].filter((w) => w !== SILENT_CUE && !getCueBuffer(w));
}

export type BeatCallback = (info: BeatInfo) => void;
export type FinishCallback = () => void;

/**
 * High-precision metronome engine using Web Audio API look-ahead scheduling.
 *
 * ALL audio — clicks and voice cues — is played via AudioBufferSourceNode.start(time)
 * for sample-accurate timing on the hardware audio clock.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private nextBeatTime = 0;
  private sectionIdx = 0;
  private barInSection = 0;
  private beatInBar = 0;
  private timerID: number | null = null;
  private _isPlaying = false;
  /** Bumped on stop so UI callbacks from an earlier run are dropped. */
  private runId = 0;
  private song: Song | null = null;
  private onBeat: BeatCallback | null = null;
  private onFinish: FinishCallback | null = null;

  /** Clicks this run that were handed to the audio clock after their time. */
  private lateCount = 0;
  private maxLateMs = 0;

  private readonly SCHEDULE_AHEAD = 0.1;
  private readonly LOOKAHEAD_MS = 25;

  get isPlaying() {
    return this._isPlaying;
  }

  setCallbacks(onBeat: BeatCallback, onFinish: FinishCallback) {
    this.onBeat = onBeat;
    this.onFinish = onFinish;
  }

  /**
   * Starts the song. Resolves with the song's cue words whose recording could
   * not be loaded (the click still plays; those cues are silent). Throws if
   * the audio system can't be started.
   */
  async start(song: Song): Promise<string[]> {
    this.stop();
    const run = this.runId;
    this.song = song;

    requestPlaybackAudioSession();
    // Never let the screen sleep mid-song: on iOS a locked screen suspends JS
    // timers, which would silently stop the look-ahead scheduler.
    KeepAwake.keepAwake().catch((e) => {
      if (Capacitor.isNativePlatform()) reportError(e, 'audio.keep-awake');
    });

    this.ctx = audioContext();
    await this.ctx.resume();

    if (!clickAccentBuf) clickAccentBuf = await this.renderClick(1000, 0.7);
    if (!clickNormalBuf) clickNormalBuf = await this.renderClick(800, 0.35);

    await preloadAllCueBuffers(this.ctx);

    // Stopped (or restarted) while loading: don't start this run.
    if (run !== this.runId) return [];

    // Each failed load is already reported by cueAudio (and retried on the
    // next start); here the player just needs to know which cues are silent.
    const missing = missingCueWords(song);

    this.lateCount = 0;
    this.maxLateMs = 0;
    this.sectionIdx = 0;
    this.barInSection = 0;
    this.beatInBar = 0;
    this._isPlaying = true;
    this.nextBeatTime = this.ctx.currentTime + 0.05;

    this.scheduler();
    this.timerID = window.setInterval(() => this.scheduler(), this.LOOKAHEAD_MS);
    return missing;
  }

  stop() {
    this.reportLateClicks();
    this._isPlaying = false;
    this.runId++;
    if (this.timerID !== null) {
      window.clearInterval(this.timerID);
      this.timerID = null;
    }
    KeepAwake.allowSleep().catch(() => {});
  }

  /**
   * A late click is the one failure musicians hear. The look-ahead makes it
   * rare (JS would have to stall >75 ms), so any occurrence is worth knowing.
   */
  private reportLateClicks() {
    if (this.lateCount > 0 && this.song) {
      reportWarning('Clicks played late', 'audio.late', {
        count: this.lateCount,
        maxLateMs: Math.round(this.maxLateMs),
        bpm: this.song.bpm,
        timeSignature: this.song.timeSignature,
        platform: Capacitor.getPlatform(),
      });
    }
    this.lateCount = 0;
    this.maxLateMs = 0;
  }

  private async renderClick(freq: number, vol: number): Promise<AudioBuffer> {
    const sr = this.ctx!.sampleRate;
    const dur = 0.06;
    const offline = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
    const osc = offline.createOscillator();
    const gain = offline.createGain();
    osc.connect(gain);
    gain.connect(offline.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, dur);
    osc.start(0);
    osc.stop(dur);
    return offline.startRendering();
  }

  private scheduler() {
    if (!this.ctx || !this.song || !this._isPlaying) return;

    while (this.nextBeatTime < this.ctx.currentTime + this.SCHEDULE_AHEAD) {
      this.scheduleBeat(this.nextBeatTime);
      if (!this._isPlaying) break;
      this.advanceBeat();
    }
  }

  private scheduleBeat(time: number) {
    if (!this.ctx || !this.song) return;
    const section = this.song.sections[this.sectionIdx];
    if (!section) return;

    const ts = this.song.timeSignature;
    const accents = getAccentBeats(ts);
    const isAccent = accents.includes(this.beatInBar);
    const beatsPerBar = getBeatsPerBar(ts);

    let cueWord: string | undefined;
    if (section.cue && this.barInSection + 1 === section.cue.bar) {
      cueWord = section.cue.words[this.beatInBar];
      if (cueWord === SILENT_CUE) cueWord = undefined;
    }

    const lateMs = (this.ctx.currentTime - time) * 1000;
    if (lateMs > 1) {
      this.lateCount++;
      this.maxLateMs = Math.max(this.maxLateMs, lateMs);
    }

    this.playBuffer(isAccent ? clickAccentBuf : clickNormalBuf, time, 1.0);

    if (cueWord) {
      const cueBuf = getCueBuffer(cueWord);
      if (cueBuf) {
        this.playBuffer(cueBuf, time, 1.0);
      }
    }

    const beatInfo: BeatInfo = {
      sectionIndex: this.sectionIdx,
      sectionName: section.name,
      bar: this.barInSection + 1,
      totalBars: section.bars,
      beat: this.beatInBar + 1,
      totalBeats: beatsPerBar,
      isAccent,
      cueWord,
    };

    // Fire the UI when the click is *heard*, not when it is scheduled.
    const run = this.runId;
    const delayMs = Math.max(
      0,
      (time - this.ctx.currentTime + this.outputDelay()) * 1000
    );
    setTimeout(() => {
      if (this.runId === run) this.onBeat?.(beatInfo);
    }, delayMs);
  }

  /**
   * Seconds between ctx.currentTime and the sound reaching the speaker. Read
   * live on every beat so it follows route changes (e.g. Bluetooth headphones).
   */
  private outputDelay(): number {
    if (!COMPENSATE_OUTPUT_LATENCY || !this.ctx) return 0;
    const ctx = this.ctx as AudioContext & { outputLatency?: number };
    const total = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    return Number.isFinite(total) ? Math.min(Math.max(total, 0), 1) : 0;
  }

  private playBuffer(buffer: AudioBuffer | null, time: number, volume: number) {
    if (!buffer || !this.ctx) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(time);
  }

  private advanceBeat() {
    if (!this.song) return;
    const beatsPerBar = getBeatsPerBar(this.song.timeSignature);
    const section = this.song.sections[this.sectionIdx];

    this.beatInBar++;
    if (this.beatInBar >= beatsPerBar) {
      this.beatInBar = 0;
      this.barInSection++;
      if (this.barInSection >= section.bars) {
        this.barInSection = 0;
        this.sectionIdx++;
        if (this.sectionIdx >= this.song.sections.length) {
          this._isPlaying = false;
          if (this.timerID !== null) {
            window.clearInterval(this.timerID);
            this.timerID = null;
          }
          KeepAwake.allowSleep().catch(() => {});
          this.reportLateClicks();
          const run = this.runId;
          setTimeout(() => {
            if (this.runId === run) this.onFinish?.();
          }, 100 + this.outputDelay() * 1000);
          return;
        }
      }
    }

    const secondsPerBeat = 60.0 / this.song.bpm;
    this.nextBeatTime += secondsPerBeat;
  }
}
