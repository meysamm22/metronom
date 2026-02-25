import type { Song, BeatInfo } from './types';
import { getBeatsPerBar, getAccentBeats } from './types';

export type BeatCallback = (info: BeatInfo) => void;
export type FinishCallback = () => void;

/**
 * High-precision metronome engine using Web Audio API look-ahead scheduling.
 *
 * ALL audio (clicks, cue tones) is scheduled on the hardware audio clock via
 * AudioBufferSourceNode.start(time) for sample-accurate timing. No setTimeout
 * is used for audio — only for UI callbacks.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private nextBeatTime = 0;
  private sectionIdx = 0;
  private barInSection = 0;
  private beatInBar = 0;
  private timerID: number | null = null;
  private _isPlaying = false;
  private song: Song | null = null;
  private onBeat: BeatCallback | null = null;
  private onFinish: FinishCallback | null = null;

  private clickAccentBuf: AudioBuffer | null = null;
  private clickNormalBuf: AudioBuffer | null = null;
  private cueVoiceBuf: AudioBuffer | null = null;
  private cueCountBufs: Map<string, AudioBuffer> = new Map();

  private readonly SCHEDULE_AHEAD = 0.1;
  private readonly LOOKAHEAD_MS = 25;

  get isPlaying() {
    return this._isPlaying;
  }

  setCallbacks(onBeat: BeatCallback, onFinish: FinishCallback) {
    this.onBeat = onBeat;
    this.onFinish = onFinish;
  }

  async start(song: Song) {
    this.stop();
    this.song = song;

    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    await this.ctx.resume();
    await this.prepareBuffers(song);

    this.sectionIdx = 0;
    this.barInSection = 0;
    this.beatInBar = 0;
    this._isPlaying = true;
    this.nextBeatTime = this.ctx.currentTime + 0.05;

    this.scheduler();
    this.timerID = window.setInterval(() => this.scheduler(), this.LOOKAHEAD_MS);
  }

  stop() {
    this._isPlaying = false;
    if (this.timerID !== null) {
      window.clearInterval(this.timerID);
      this.timerID = null;
    }
  }

  /**
   * Pre-render all audio buffers using OfflineAudioContext so playback is just
   * scheduling pre-built buffers — zero processing at play time.
   */
  private async prepareBuffers(song: Song) {
    const sr = this.ctx!.sampleRate;

    if (!this.clickAccentBuf) {
      this.clickAccentBuf = await this.renderTone(sr, {
        freq: 1000, type: 'sine', vol: 0.7, dur: 0.04, decay: 0.04,
      });
    }
    if (!this.clickNormalBuf) {
      this.clickNormalBuf = await this.renderTone(sr, {
        freq: 800, type: 'sine', vol: 0.35, dur: 0.03, decay: 0.03,
      });
    }
    if (!this.cueVoiceBuf) {
      this.cueVoiceBuf = await this.renderCueVoice(sr);
    }

    const words = new Set<string>();
    for (const section of song.sections) {
      if (section.cue) {
        for (let i = 1; i < section.cue.words.length; i++) {
          words.add(section.cue.words[i]);
        }
      }
    }
    for (const word of words) {
      if (!this.cueCountBufs.has(word)) {
        const buf = await this.renderCountTone(sr, word);
        this.cueCountBufs.set(word, buf);
      }
    }
  }

  private async renderTone(
    sr: number,
    opts: { freq: number; type: OscillatorType; vol: number; dur: number; decay: number }
  ): Promise<AudioBuffer> {
    const totalDur = opts.dur + opts.decay;
    const offline = new OfflineAudioContext(1, Math.ceil(sr * totalDur), sr);
    const osc = offline.createOscillator();
    const gain = offline.createGain();
    osc.connect(gain);
    gain.connect(offline.destination);
    osc.frequency.value = opts.freq;
    osc.type = opts.type;
    gain.gain.setValueAtTime(opts.vol, 0);
    gain.gain.setValueAtTime(opts.vol, opts.dur);
    gain.gain.exponentialRampToValueAtTime(0.001, totalDur);
    osc.start(0);
    osc.stop(totalDur);
    return offline.startRendering();
  }

  /**
   * Two-note descending alert for the voice/section-name cue beat.
   * Clearly distinct from clicks and count tones.
   */
  private async renderCueVoice(sr: number): Promise<AudioBuffer> {
    const dur = 0.15;
    const offline = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);

    const osc1 = offline.createOscillator();
    const gain1 = offline.createGain();
    osc1.connect(gain1);
    gain1.connect(offline.destination);
    osc1.frequency.value = 880;
    osc1.type = 'triangle';
    gain1.gain.setValueAtTime(0.5, 0);
    gain1.gain.exponentialRampToValueAtTime(0.001, 0.07);
    osc1.start(0);
    osc1.stop(0.07);

    const osc2 = offline.createOscillator();
    const gain2 = offline.createGain();
    osc2.connect(gain2);
    gain2.connect(offline.destination);
    osc2.frequency.value = 660;
    osc2.type = 'triangle';
    gain2.gain.setValueAtTime(0.0001, 0);
    gain2.gain.setValueAtTime(0.45, 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, dur);
    osc2.start(0.06);
    osc2.stop(dur);

    return offline.startRendering();
  }

  /**
   * Each count number gets a unique pitch on an ascending major scale,
   * making the count progression clearly audible.
   */
  private async renderCountTone(sr: number, word: string): Promise<AudioBuffer> {
    const num = parseInt(word);
    const pitchMap: Record<number, number> = {
      1: 523,  // C5
      2: 587,  // D5
      3: 659,  // E5
      4: 698,  // F5
      5: 784,  // G5
      6: 880,  // A5
      7: 988,  // B5
      8: 1047, // C6
      9: 1175, // D6
    };
    const freq = pitchMap[num] ?? 523;
    return this.renderTone(sr, {
      freq, type: 'triangle', vol: 0.45, dur: 0.04, decay: 0.06,
    });
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
    let isCueVoice = false;

    if (section.cue && this.barInSection + 1 === section.cue.bar) {
      cueWord = section.cue.words[this.beatInBar];
      if (this.beatInBar === 0) isCueVoice = true;
    }

    this.playBuffer(isAccent ? this.clickAccentBuf : this.clickNormalBuf, time);

    if (cueWord) {
      if (isCueVoice) {
        this.playBuffer(this.cueVoiceBuf, time);
      } else {
        this.playBuffer(this.cueCountBufs.get(cueWord) ?? null, time);
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

    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      if (this._isPlaying) this.onBeat?.(beatInfo);
    }, delayMs);
  }

  private playBuffer(buffer: AudioBuffer | null, time: number) {
    if (!buffer || !this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
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
          setTimeout(() => this.onFinish?.(), 100);
          return;
        }
      }
    }

    const secondsPerBeat = 60.0 / this.song.bpm;
    this.nextBeatTime += secondsPerBeat;
  }
}
