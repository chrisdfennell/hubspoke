import { GameState } from '../state/GameState';
import { netWorth } from './Milestones';
import { clock } from './Clock';

/**
 * Career-stats daily hook. Most stat fields are bumped at the source by the
 * system that generates the underlying event (Flights records flights /
 * crashes, TravelAgencyScene records routes opened, etc). This module owns
 * the two fields that need a periodic sample — days-played count and the
 * running peak net-worth high-water mark.
 */
export function registerStatsHooks() {
  clock.onDay(() => {
    const state = GameState.get();
    state.stats.daysPlayed++;
    const nw = netWorth(state.human);
    if (nw > state.stats.peakNetWorth) state.stats.peakNetWorth = nw;
  });
}
