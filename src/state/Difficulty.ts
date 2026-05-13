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
  /** Max cargo contracts a single AI accepts per day. Higher = AI sweeps
   *  the contract board harder before the human can grab one. */
  aiCargoMaxPerDay: number;
  /** Minimum net-of-fuel margin (0..1) an AI requires to bid on cargo.
   *  Lower = AI takes thinner-margin contracts the player would skip. */
  aiCargoMinMargin: number;
  /** Price/fundamental ratio above which an AI sells held shares. Higher
   *  = AI hoards positions longer (takeover threat sticks around). */
  aiSellOvervalueThreshold: number;

  /** Multiplier on the default loan APR. */
  loanAprMult: number;
  /** Required monthly principal payment as a fraction of outstanding loan.
   *  0 = interest-only forever (Easy mode). Hit 3 consecutive missed
   *  monthly payments and creditors seize the airline. */
  requiredPrincipalPct: number;
  /** Floor on the monthly principal payment in $ — so a tiny loan still
   *  has a meaningful obligation. Ignored when requiredPrincipalPct is 0. */
  requiredPrincipalMin: number;

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
    startCash:        25_000_000,
    startPilots:      3,
    startMechanics:   3,
    aiBuyChance:      0.20,
    aiStockBudgetMult:0.5,
    aiSabotageChance: 0.02,
    aiCargoMaxPerDay: 1,
    aiCargoMinMargin: 0.50,
    aiSellOvervalueThreshold: 1.15,
    loanAprMult:      0.7,
    eventChance:      0.15,
    requiredPrincipalPct: 0,
    requiredPrincipalMin: 0,
  },
  normal: {
    label: 'Normal',
    tagline: 'Standard balance. Recommended first run.',
    startCash:        14_000_000,
    startPilots:      2,
    startMechanics:   2,
    aiBuyChance:      0.40,
    aiStockBudgetMult:1.0,
    aiSabotageChance: 0.06,
    aiCargoMaxPerDay: 2,
    aiCargoMinMargin: 0.35,
    aiSellOvervalueThreshold: 1.25,
    loanAprMult:      1.0,
    eventChance:      0.25,
    requiredPrincipalPct: 0.04,
    requiredPrincipalMin: 50_000,
  },
  hard: {
    label: 'Hard',
    tagline: 'Tighter purse strings. Rivals expand quickly and bid for your shares.',
    startCash:        6_000_000,
    startPilots:      1,
    startMechanics:   1,
    aiBuyChance:      0.55,
    aiStockBudgetMult:1.5,
    aiSabotageChance: 0.10,
    aiCargoMaxPerDay: 3,
    aiCargoMinMargin: 0.25,
    aiSellOvervalueThreshold: 1.35,
    loanAprMult:      1.3,
    eventChance:      0.35,
    requiredPrincipalPct: 0.07,
    requiredPrincipalMin: 75_000,
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
    aiCargoMaxPerDay: 4,
    aiCargoMinMargin: 0.15,
    aiSellOvervalueThreshold: 1.50,
    loanAprMult:      1.6,
    eventChance:      0.45,
    requiredPrincipalPct: 0.10,
    requiredPrincipalMin: 100_000,
  },
};

export function getDifficulty(d: Difficulty): DifficultySettings {
  return DIFFICULTIES[d];
}
