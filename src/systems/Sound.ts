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

// ---- Music palettes ----
// Frequencies are in Hz (equal-temperament). Each chord = list of notes
// played as overlapping sine pad voices. Chord progressions loop; melody
// notes are picked randomly from their pentatonic scale arrays.

/** Airport lobby — A minor: Am → F → C → G. Loungey, slightly melancholic. */
const AIRPORT_PROG: number[][] = [
  [110.00, 220.00, 261.63, 329.63],  // Am   (A2 A3 C4 E4)
  [ 87.31, 174.61, 220.00, 261.63],  // F    (F2 F3 A3 C4)
  [ 65.41, 130.81, 164.81, 196.00],  // C    (C2 C3 E3 G3)
  [ 98.00, 196.00, 246.94, 293.66],  // G    (G2 G3 B3 D4)
];
/** Control Tower / World Map — Dmin → Bbmaj → Fmaj → A7. Open and airy. */
const WORLDMAP_PROG: number[][] = [
  [ 73.42, 146.83, 220.00, 293.66],  // Dm   (D2 D3 A3 D4)
  [116.54, 233.08, 293.66, 349.23],  // Bb   (Bb2 Bb3 D4 F4)
  [ 87.31, 174.61, 261.63, 349.23],  // F    (F2 F3 C4 F4)
  [110.00, 220.00, 277.18, 329.63],  // A    (A2 A3 C#4 E4)
];
/** Title screen — short brassy phrase. Cmaj → Am → Fmaj → G7. */
const TITLE_PROG: number[][] = [
  [130.81, 261.63, 329.63, 392.00],  // C
  [110.00, 220.00, 261.63, 329.63],  // Am
  [ 87.31, 174.61, 261.63, 349.23],  // F
  [ 98.00, 196.00, 246.94, 293.66],  // G
];
/** Melodic scales (pentatonic — won't clash with any tonal chord). */
const MELODY_PENTATONIC_A: number[] = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
const MELODY_PENTATONIC_C: number[] = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];

/** Music track ids — each one is a different procedural composition. */
export type MusicTrack = 'airport-lobby' | 'world-map' | 'title';

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean;
  /** Music sub-bus: gain node sitting between music oscillators and the
   *  master bus, so music volume can be set independently of SFX. */
  private musicGain: GainNode | null = null;
  /** Setting 0..1; lower than SFX so the loop doesn't fatigue. Saved with
   *  the same localStorage key family as mute so it survives reloads. */
  private musicVolume = 0.35;
  /** setTimeout handles for the currently-scheduled music notes. Cleared
   *  by stopMusic so chord/melody scheduling halts. */
  private musicTimers: number[] = [];
  /** Track currently playing (note scheduling active). */
  private currentTrack: MusicTrack | null = null;
  /** Last requested track — remembered across mutes so un-muting restarts
   *  whatever the scene last asked for, without each scene needing to
   *  hook the mute toggle. Cleared only by an explicit stopMusic(). */
  private desiredTrack: MusicTrack | null = null;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    const v = parseFloat(localStorage.getItem('airline-tycoon-music-vol') ?? '');
    if (!Number.isNaN(v) && v >= 0 && v <= 1) this.musicVolume = v;
  }

  isMuted(): boolean { return this.muted; }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) localStorage.setItem(MUTE_KEY, '1');
    else   localStorage.removeItem(MUTE_KEY);
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 1;
    // Halt music scheduling on mute (saves CPU on the silent loop) and
    // restart on un-mute if a track was requested at any point.
    if (m) {
      this.haltMusicScheduling();
    } else if (this.desiredTrack && !this.currentTrack) {
      const t = this.desiredTrack;
      this.desiredTrack = null;
      this.startMusic(t);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMusicVolume(v: number) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    localStorage.setItem('airline-tycoon-music-vol', this.musicVolume.toString());
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
  }

  getMusicVolume(): number { return this.musicVolume; }

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

  // ----- Music -----

  /** Start (or switch to) a procedural music track. No-op if the requested
   *  track is already playing. Safe to call repeatedly — internally it
   *  stops any prior track before scheduling the new one. Called while
   *  muted, the request is remembered (desiredTrack) and started when the
   *  player un-mutes. */
  startMusic(track: MusicTrack) {
    this.desiredTrack = track;
    if (this.currentTrack === track) return;
    this.haltMusicScheduling();
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);
    }
    this.currentTrack = track;
    // Both tracks share the same chord-pad + sparse-melody structure;
    // the chord palette and tempo are what give them distinct moods.
    if (track === 'airport-lobby') {
      this.scheduleChordLoop(ctx, AIRPORT_PROG, 4.0);
      this.scheduleMelodyLoop(ctx, MELODY_PENTATONIC_A, 1500, 3000);
    } else if (track === 'world-map') {
      this.scheduleChordLoop(ctx, WORLDMAP_PROG, 6.0);
      this.scheduleMelodyLoop(ctx, MELODY_PENTATONIC_C, 2200, 4500);
    } else if (track === 'title') {
      this.scheduleChordLoop(ctx, TITLE_PROG, 3.0);
      this.scheduleMelodyLoop(ctx, MELODY_PENTATONIC_A, 1100, 2200);
    }
  }

  /** Stop the current track AND forget the desired track. Use when leaving
   *  to the title screen / game over — un-muting after this won't restart. */
  stopMusic() {
    this.haltMusicScheduling();
    this.desiredTrack = null;
  }

  private haltMusicScheduling() {
    for (const t of this.musicTimers) clearTimeout(t);
    this.musicTimers = [];
    this.currentTrack = null;
    // Active oscillators fade out on their per-chord envelopes; we don't
    // need to forcibly kill them. Worst case is a half-second tail.
  }

  /** Lay down one chord every chordDur seconds, looping over the palette.
   *  Each chord is a small bundle of overlapping sine oscillators with
   *  attack/release envelopes — sounds like a soft synth pad. */
  private scheduleChordLoop(ctx: AudioContext, prog: number[][], chordDur: number) {
    let idx = 0;
    const playNext = () => {
      if (this.currentTrack === null) return;
      this.playChord(ctx, prog[idx % prog.length], chordDur);
      idx++;
      this.musicTimers.push(window.setTimeout(playNext, chordDur * 1000));
    };
    playNext();
  }

  private playChord(ctx: AudioContext, freqs: number[], durSec: number) {
    if (!this.musicGain) return;
    const now = ctx.currentTime;
    const attack = 0.4;
    const release = 0.6;
    const peak = 0.06; // per-voice; sum stays comfortable for a 3-4 note chord
    for (const freq of freqs) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + attack);
      gain.gain.setValueAtTime(peak, now + durSec - release);
      gain.gain.linearRampToValueAtTime(0, now + durSec);
      gain.connect(this.musicGain);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + durSec + 0.05);
    }
  }

  /** Schedule a sparse melodic note at random intervals within
   *  [minMs, maxMs]. Pitch is randomly picked from a pentatonic palette
   *  — guaranteed to never clash with the chord pad behind it. */
  private scheduleMelodyLoop(ctx: AudioContext, scale: number[], minMs: number, maxMs: number) {
    const playOne = () => {
      if (this.currentTrack === null) return;
      const freq = scale[Math.floor(Math.random() * scale.length)];
      this.playMelodyNote(ctx, freq);
      const next = minMs + Math.random() * (maxMs - minMs);
      this.musicTimers.push(window.setTimeout(playOne, next));
    };
    // Small initial offset so the very first melody note doesn't land on
    // beat 1 of the chord pad (would feel too "on" for an ambient track).
    this.musicTimers.push(window.setTimeout(playOne, 1200));
  }

  private playMelodyNote(ctx: AudioContext, freq: number) {
    if (!this.musicGain) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    gain.connect(this.musicGain);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 1.5);
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
