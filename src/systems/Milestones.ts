import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { portfolioValue } from './Stocks';
import { clock } from './Clock';
import { ACHIEVEMENTS, Achievement, isUnlocked } from '../state/achievements';

export interface Milestone {
  id: string;
  threshold: number;
  /** Human-readable headline used for the news entry. */
  label: string;
  /** Optional flair text appended to the news. */
  flavor?: string;
}

/**
 * Net-worth tiers that fire the big HUDScene celebration popup. Filtered
 * from the unified ACHIEVEMENTS registry — these are the legacy four
 * milestones; non-wealth achievements unlock more quietly via news only.
 *
 * Kept exported for HUDScene which uses this list to decide which newly-
 * unlocked achievement ids deserve a celebration banner.
 */
export const MILESTONES: Milestone[] = ACHIEVEMENTS
  .filter(a => a.category === 'wealth')
  .map(a => ({ id: a.id, threshold: a.target, label: a.name, flavor: a.description }));

/** Threshold that triggers the alternative "billionaire" victory in HUDScene. */
export const BILLIONAIRE_VICTORY = 1_000_000_000;

/** Cash + savings + portfolio − loan. Used everywhere we report net worth. */
export function netWorth(player: Player): number {
  return player.cash + player.savings + portfolioValue(player) - player.loan;
}

/**
 * Check every achievement against the live state and unlock any that have
 * crossed their target since the last check. Pushes a news entry per
 * unlock — wealth-tier ones additionally fire HUDScene's celebration popup
 * (which polls `state.achievementsUnlocked` filtered by MILESTONES).
 *
 * Idempotent — already-unlocked ids are skipped, and the result is stored
 * back on `state.achievementsUnlocked`.
 */
export function checkAchievements() {
  const state = GameState.get();
  const reached = new Set(state.achievementsUnlocked);
  for (const a of ACHIEVEMENTS) {
    if (reached.has(a.id)) continue;
    if (!isUnlocked(a, state)) continue;
    reached.add(a.id);
    state.pushNews(`★ ${headlineFor(a)}`);
  }
  state.achievementsUnlocked = [...reached];
}

function headlineFor(a: Achievement): string {
  if (a.unlockedHeadline) return a.unlockedHeadline;
  // Wealth tier reads as a Milestone; others read as Achievement.
  const prefix = a.category === 'wealth' ? 'Milestone' : 'Achievement';
  return `${prefix}: ${a.name}.${a.description ? `  ${a.description}` : ''}`;
}

export function registerMilestoneHooks() {
  clock.onDay(() => checkAchievements());
}
