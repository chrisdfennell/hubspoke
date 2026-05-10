/**
 * Procedural sound effects via Web Audio API. No external assets — every
 * effect is synthesized on the fly from oscillators + envelopes.
 *
 * Browser autoplay policy: AudioContext can only start in response to a user
 * gesture. We lazily create it on the first `play()` call, which is always
 * triggered by a click in this game.
 */

export type SoundName =
  | 'click'
  | 'buy'
  | 'takeoff'
  | 'land'
  | 'alert'
  | 'cashGain'
  | 'cashLoss'
  | 'gameOver'
  | 'sabotage';

const MUTE_KEY = 'airline-tycoon-mute';

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  isMuted(): boolean { return this.muted; }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) localStorage.setItem(MUTE_KEY, '1');
    else   localStorage.removeItem(MUTE_KEY);
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 1;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1;
        this.masterGain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  play(name: SoundName) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    switch (name) {
      case 'click':    this.synthClick(ctx); break;
      case 'buy':      this.synthBuy(ctx); break;
      case 'takeoff':  this.synthTakeoff(ctx); break;
      case 'land':     this.synthLand(ctx); break;
      case 'alert':    this.synthAlert(ctx); break;
      case 'cashGain': this.synthCashGain(ctx); break;
      case 'cashLoss': this.synthCashLoss(ctx); break;
      case 'gameOver': this.synthGameOver(ctx); break;
      case 'sabotage': this.synthSabotage(ctx); break;
    }
  }

  // ----- Synthesis primitives -----
  private envelope(ctx: AudioContext, durSec: number, peak = 0.3): GainNode {
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durSec);
    g.connect(this.masterGain!);
    return g;
  }

  private tone(ctx: AudioContext, freq: number, durSec: number, type: OscillatorType = 'sine', peak = 0.25, freqEnd?: number) {
    const env = this.envelope(ctx, durSec, peak);
    const osc = ctx.createOscillator();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + durSec);
    }
    osc.connect(env);
    osc.start(now);
    osc.stop(now + durSec + 0.05);
  }

  private noiseBurst(ctx: AudioContext, durSec: number, peak = 0.15) {
    const env = this.envelope(ctx, durSec, peak);
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durSec), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(env);
    src.start();
  }

  // ----- Per-effect synthesis -----
  private synthClick(ctx: AudioContext) {
    this.tone(ctx, 1200, 0.04, 'square', 0.10);
  }

  private synthBuy(ctx: AudioContext) {
    // Rising arpeggio C5 → E5 → G5
    this.tone(ctx, 523.25, 0.10, 'triangle', 0.18);
    setTimeout(() => this.tone(ctx, 659.25, 0.10, 'triangle', 0.18), 70);
    setTimeout(() => this.tone(ctx, 783.99, 0.18, 'triangle', 0.20), 140);
  }

  private synthTakeoff(ctx: AudioContext) {
    // Low rising whoosh (sweep) + noise
    this.tone(ctx, 100, 0.6, 'sawtooth', 0.10, 320);
    this.noiseBurst(ctx, 0.6, 0.06);
  }

  private synthLand(ctx: AudioContext) {
    // Short descending tone — softer than takeoff
    this.tone(ctx, 320, 0.25, 'sine', 0.12, 140);
  }

  private synthAlert(ctx: AudioContext) {
    // Two-tone chime
    this.tone(ctx, 880, 0.18, 'sine', 0.18);
    setTimeout(() => this.tone(ctx, 1175, 0.20, 'sine', 0.18), 160);
  }

  private synthCashGain(ctx: AudioContext) {
    this.tone(ctx, 700, 0.10, 'triangle', 0.18, 1100);
  }

  private synthCashLoss(ctx: AudioContext) {
    this.tone(ctx, 500, 0.18, 'sawtooth', 0.16, 200);
  }

  private synthGameOver(ctx: AudioContext) {
    this.tone(ctx, 440, 0.25, 'sawtooth', 0.20);
    setTimeout(() => this.tone(ctx, 330, 0.30, 'sawtooth', 0.20), 200);
    setTimeout(() => this.tone(ctx, 220, 0.60, 'sawtooth', 0.22), 450);
  }

  private synthSabotage(ctx: AudioContext) {
    // A creaky descending pitch + noise — "something happened"
    this.tone(ctx, 600, 0.20, 'square', 0.10, 200);
    this.noiseBurst(ctx, 0.20, 0.08);
  }
}

export const sound = new SoundManager();
