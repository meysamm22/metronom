import type { Song, BeatInfo } from './types';
import { getBeatsPerBar, getAccentBeats } from './types';

export type BeatCallback = (info: BeatInfo) => void;
export type FinishCallback = () => void;

/**
 * High-precision metronome engine using Web Audio API look-ahead scheduling.
 *
 * Sounds are scheduled on the audio hardware clock for sample-accurate timing.
 * A JS setInterval only decides *what* to schedule — actual playback timing
 * is decoupled from JS timer jitter.
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
  private speechUnlocked = false;

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
   * iOS requires speechSynthesis.speak() to be called directly from a user
   * gesture at least once. Call this from the play button's click handler
   * before starting the engine.
   */
  private warmUpSpeech() {
    if (this.speechUnlocked) return;
    if (typeof speechSynthesis === 'undefined') return;

    const utt = new SpeechSynthesisUtterance('');
    utt.volume = 0;
    utt.rate = 10;
    speechSynthesis.speak(utt);
    this.speechUnlocked = true;
  }

  start(song: Song) {
    this.stop();
    this.song = song;

    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    this.ctx.resume();
    this.warmUpSpeech();

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
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
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

    this.scheduleClick(time, isAccent);

    if (cueWord) {
      this.scheduleSpeech(cueWord, time);
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

  private scheduleClick(time: number, isAccent: boolean) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (isAccent) {
      osc.frequency.value = 1000;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      osc.start(time);
      osc.stop(time + 0.08);
    } else {
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.start(time);
      osc.stop(time + 0.05);
    }
  }

  /**
   * speechSynthesis has ~100-300ms processing latency before audio comes out.
   * We fire it ahead of the beat to compensate so the voice lands closer to
   * the click. The SPEECH_LEAD_MS value is tuned for typical mobile devices.
   */
  private static readonly SPEECH_LEAD_MS = 200;

  private scheduleSpeech(word: string, time: number) {
    if (!this.ctx || typeof speechSynthesis === 'undefined') return;
    const delayMs = Math.max(
      0,
      (time - this.ctx.currentTime) * 1000 - AudioEngine.SPEECH_LEAD_MS
    );
    setTimeout(() => {
      if (!this._isPlaying) return;
      speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(word);
      utt.rate = 1.3;
      utt.pitch = 1.0;
      utt.volume = 1;
      speechSynthesis.speak(utt);
    }, delayMs);
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
