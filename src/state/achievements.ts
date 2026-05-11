import { GameState } from './GameState';
import { netWorth } from '../systems/Milestones';

export type AchievementCategory = 'wealth' | 'operations' | 'fleet' | 'network' | 'notable';

export interface Achievement {
  id: string;
  name: string;
  /** Short flavor text shown under the name. */
  description: string;
  category: AchievementCategory;
  /** Emoji or unicode glyph used as the medal icon in the Stats panel. */
  icon: string;
  /** Numerical target; unlock fires when `progress(state) >= target`. */
  target: number;
  /** Read current progress out of the live game state. */
  progress(state: GameState): number;
  /** Headline copy when unlocked. Defaults to `Achievement: <name>.` */
  unlockedHeadline?: string;
}

/**
 * All achievements in one registry, including the four legacy net-worth tiers
 * (`first-10m` / `first-100m` / `first-500m` / `first-1b`). Keeping those ids
 * stable means existing saves' `milestonesReached` carry over cleanly into
 * `achievementsUnlocked` — no double-fires on reload.
 *
 * Wealth-tier ids are the same as before, so HUDScene's celebration popup
 * (which filters by the `MILESTONES` subset in Milestones.ts) still fires
 * the big banner for those four and a quieter news-only entry for everything
 * else.
 */
export const ACHIEVEMENTS: Achievement[] = [
  // --- Wealth (legacy ids — keep these stable for save-compat) ---
  { id: 'first-10m',  category: 'wealth', icon: '💰', name: 'First $10M net worth',
    description: 'Trade press notices.',
    target: 10_000_000,    progress: s => netWorth(s.human) },
  { id: 'first-100m', category: 'wealth', icon: '💰', name: 'First $100M net worth',
    description: 'You are now a serious airline.',
    target: 100_000_000,   progress: s => netWorth(s.human) },
  { id: 'first-500m', category: 'wealth', icon: '💰', name: 'First $500M net worth',
    description: 'Investors are circling.',
    target: 500_000_000,   progress: s => netWorth(s.human) },
  { id: 'first-1b',   category: 'wealth', icon: '🏆', name: '$1 Billion net worth',
    description: "You've built an empire.",
    target: 1_000_000_000, progress: s => netWorth(s.human) },

  // --- Operations ---
  { id: 'first-flight', category: 'operations', icon: '✈', name: 'First flight',
    description: 'Wheels up.',
    target: 1, progress: s => s.stats.flights },
  { id: 'flights-100', category: 'operations', icon: '✈', name: '100 flights',
    description: 'Regular service.',
    target: 100, progress: s => s.stats.flights },
  { id: 'flights-1000', category: 'operations', icon: '✈', name: '1,000 flights',
    description: 'Steady operator.',
    target: 1000, progress: s => s.stats.flights },
  { id: 'flights-10000', category: 'operations', icon: '✈', name: '10,000 flights',
    description: 'Veteran carrier.',
    target: 10000, progress: s => s.stats.flights },
  { id: 'pax-1k', category: 'operations', icon: '👥', name: '1,000 passengers',
    description: 'A modest following.',
    target: 1000, progress: s => s.stats.passengers },
  { id: 'pax-10k', category: 'operations', icon: '👥', name: '10,000 passengers',
    description: 'They love you.',
    target: 10_000, progress: s => s.stats.passengers },
  { id: 'pax-100k', category: 'operations', icon: '👥', name: '100,000 passengers',
    description: 'Carrier of choice.',
    target: 100_000, progress: s => s.stats.passengers },
  { id: 'pax-1m', category: 'operations', icon: '👥', name: '1 million passengers',
    description: 'Household name.',
    target: 1_000_000, progress: s => s.stats.passengers },

  // --- Fleet ---
  { id: 'fleet-3',  category: 'fleet', icon: '🛩', name: 'Fleet of 3',
    description: 'Small but mighty.',
    target: 3,  progress: s => s.human.planes.length },
  { id: 'fleet-5',  category: 'fleet', icon: '🛩', name: 'Fleet of 5',
    description: 'Growing fast.',
    target: 5,  progress: s => s.human.planes.length },
  { id: 'fleet-10', category: 'fleet', icon: '🛩', name: 'Fleet of 10',
    description: 'Major operator.',
    target: 10, progress: s => s.human.planes.length },
  { id: 'fleet-20', category: 'fleet', icon: '🛩', name: 'Fleet of 20',
    description: 'Air titan.',
    target: 20, progress: s => s.human.planes.length },

  // --- Network ---
  { id: 'routes-3',  category: 'network', icon: '🌐', name: '3 routes',
    description: 'A small network.',
    target: 3,  progress: s => s.human.routes.length },
  { id: 'routes-5',  category: 'network', icon: '🌐', name: '5 routes',
    description: 'Solid coverage.',
    target: 5,  progress: s => s.human.routes.length },
  { id: 'routes-10', category: 'network', icon: '🌐', name: '10 routes',
    description: 'Connected continent.',
    target: 10, progress: s => s.human.routes.length },
  { id: 'hubs-2', category: 'network', icon: '🏛', name: '2 hubs',
    description: 'Multi-hub network.',
    target: 2, progress: s => s.human.hubs.length },
  { id: 'hubs-4', category: 'network', icon: '🏛', name: '4 hubs',
    description: 'Global presence.',
    target: 4, progress: s => s.human.hubs.length },

  // --- Notable ---
  { id: 'days-30',  category: 'notable', icon: '📅', name: 'One month',
    description: '30 days at the helm.',
    target: 30, progress: s => s.stats.daysPlayed },
  { id: 'days-365', category: 'notable', icon: '📅', name: 'One year',
    description: '365 days survived.',
    target: 365, progress: s => s.stats.daysPlayed },
  { id: 'crash-1', category: 'notable', icon: '💥', name: 'Hard lessons',
    description: 'Lost a plane in flight.',
    target: 1, progress: s => s.stats.crashes },
  { id: 'best-50k', category: 'notable', icon: '💎', name: 'Big payday',
    description: 'Cleared $50k profit on one flight.',
    target: 50_000, progress: s => s.stats.bestFlightProfit },
];

export const ACHIEVEMENT_CATEGORIES: Array<{ id: AchievementCategory; label: string }> = [
  { id: 'wealth',     label: 'Wealth' },
  { id: 'operations', label: 'Operations' },
  { id: 'fleet',      label: 'Fleet' },
  { id: 'network',    label: 'Network' },
  { id: 'notable',    label: 'Notable' },
];

/** True when the achievement's progress has crossed its target. */
export function isUnlocked(a: Achievement, state: GameState): boolean {
  return a.progress(state) >= a.target;
}
