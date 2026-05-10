import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { portfolioValue } from './Stocks';
import { clock } from './Clock';

export interface Milestone {
  id: string;
  threshold: number;
  /** Human-readable headline used for the news entry. */
  label: string;
  /** Optional flair text appended to the news. */
  flavor?: string;
}

/**
 * Net-worth tiers the human earns headlines for. Tracking milestones gives the
 * mid-game some forward arrows beyond "make money / take over rivals" — the
 * existing victory conditions are eliminate-all-rivals or hit a billion via
 * `BILLIONAIRE_VICTORY` below.
 */
export const MILESTONES: Milestone[] = [
  { id: 'first-10m',  threshold:    10_000_000, label: 'First $10M net worth',  flavor: 'Trade press notices.' },
  { id: 'first-100m', threshold:   100_000_000, label: 'First $100M net worth', flavor: 'You are now a serious airline.' },
  { id: 'first-500m', threshold:   500_000_000, label: 'First $500M net worth', flavor: 'Investors are circling.' },
  { id: 'first-1b',   threshold: 1_000_000_000, label: '$1 BILLION net worth',  flavor: 'You\'ve built an empire.' },
];

/** Threshold that triggers the alternative "billionaire" victory in HUDScene. */
export const BILLIONAIRE_VICTORY = 1_000_000_000;

/** Cash + savings + portfolio − loan. Used everywhere we report net worth. */
export function netWorth(player: Player): number {
  return player.cash + player.savings + portfolioValue(player) - player.loan;
}

/** Fire any milestone news entries the human has just crossed since the last
 *  check. Idempotent — already-reached milestones are remembered in the save. */
export function checkMilestones() {
  const state = GameState.get();
  const me = state.human;
  const nw = netWorth(me);
  const reached = new Set(state.milestonesReached);
  for (const m of MILESTONES) {
    if (reached.has(m.id)) continue;
    if (nw < m.threshold) continue;
    reached.add(m.id);
    const tail = m.flavor ? `  ${m.flavor}` : '';
    state.pushNews(`★ Milestone: ${m.label}.${tail}`);
  }
  state.milestonesReached = [...reached];
}

export function registerMilestoneHooks() {
  clock.onDay(() => checkMilestones());
}
