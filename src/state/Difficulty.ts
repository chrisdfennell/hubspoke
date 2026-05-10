/**
 * Difficulty preset chosen at New Game time. Tunes starting conditions and
 * the aggressiveness of the AI rivals + event system. Persisted in saves so
 * loading the same slot keeps the chosen difficulty.
 */

export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal';

export interface DifficultySettings {
  /** $ on day 1. */
  startCash: number;
  startPilots: number;
  startMechanics: number;

  /** Per-day chance an AI rival considers buying a plane. */
  aiBuyChance: number;
  /** Multiplier on AI stock-buying budget (1.0 = baseline). */
  aiStockBudgetMult: number;
  /** Per-day chance per AI of attempting sabotage on the leader. */
  aiSabotageChance: number;

  /** Multiplier on the default loan APR. */
  loanAprMult: number;

  /** Per-day chance a random event fires. */
  eventChance: number;

  /** UI-only: short label + tagline for the picker. */
  label: string;
  tagline: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultySettings> = {
  easy: {
    label: 'Easy',
    tagline: 'Generous starting cash. Sleepy rivals. Forgiving rates.',
    startCash:        15_000_000,
    startPilots:      2,
    startMechanics:   2,
    aiBuyChance:      0.20,
    aiStockBudgetMult:0.5,
    aiSabotageChance: 0.02,
    loanAprMult:      0.7,
    eventChance:      0.15,
  },
  normal: {
    label: 'Normal',
    tagline: 'Standard balance. Recommended first run.',
    startCash:        8_000_000,
    startPilots:      1,
    startMechanics:   1,
    aiBuyChance:      0.40,
    aiStockBudgetMult:1.0,
    aiSabotageChance: 0.06,
    loanAprMult:      1.0,
    eventChance:      0.25,
  },
  hard: {
    label: 'Hard',
    tagline: 'Tighter purse strings. Rivals expand quickly and bid for your shares.',
    startCash:        4_000_000,
    startPilots:      1,
    startMechanics:   1,
    aiBuyChance:      0.55,
    aiStockBudgetMult:1.5,
    aiSabotageChance: 0.10,
    loanAprMult:      1.3,
    eventChance:      0.35,
  },
  brutal: {
    label: 'Brutal',
    tagline: 'Pocket change start, no crew, predatory AI. You will lose.',
    startCash:        2_000_000,
    startPilots:      0,
    startMechanics:   0,
    aiBuyChance:      0.70,
    aiStockBudgetMult:2.0,
    aiSabotageChance: 0.15,
    loanAprMult:      1.6,
    eventChance:      0.45,
  },
};

export function getDifficulty(d: Difficulty): DifficultySettings {
  return DIFFICULTIES[d];
}
