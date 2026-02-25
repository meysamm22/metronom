import type { Song, BeatInfo } from './types';
import { getBeatsPerBar, getAccentBeats } from './types';
import { preloadAllCueBuffers, getCueBuffer } from './cueAudio';

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
  private song: Song | null = null;
  private onBeat: BeatCallback | null = null;
  private onFinish: FinishCallback | null = null;

  private clickAccentBuf: AudioBuffer | null = null;
  private clickNormalBuf: AudioBuffer | null = null;

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

    if (!this.clickAccentBuf) {
      this.clickAccentBuf = await this.renderClick(1000, 0.7);
    }
    if (!this.clickNormalBuf) {
      this.clickNormalBuf = await this.renderClick(800, 0.35);
    }

    await preloadAllCueBuffers(this.ctx);

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
    }

    this.playBuffer(isAccent ? this.clickAccentBuf : this.clickNormalBuf, time, 1.0);

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

    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      if (this._isPlaying) this.onBeat?.(beatInfo);
    }, delayMs);
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
          setTimeout(() => this.onFinish?.(), 100);
          return;
        }
      }
    }

    const secondsPerBeat = 60.0 / this.song.bpm;
    this.nextBeatTime += secondsPerBeat;
  }
}
