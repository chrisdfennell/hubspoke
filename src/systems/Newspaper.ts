import { GameState, GameDate } from '../state/GameState';
import { SponsorContract } from '../state/Sponsor';
import { netWorth } from './Milestones';
import { clock } from './Clock';

const WEEK_DAYS = 7;

interface WeekSnap {
  date: GameDate;
  flights: number;
  passengers: number;
  revenue: number;
  fuel: number;
  cash: number;
  reputation: number;
  netWorth: number;
  /** Length of state.sponsorCompleted at snapshot time. Entries appended
   *  after this index are the resolutions that happened during the week. */
  sponsorCompletedLen: number;
}

export interface WeeklyPaper {
  weekStartDate: GameDate;
  weekEndDate: GameDate;
  /** Non-passenger news that fired during the week (excludes 💬 quotes). */
  headlines: { date: GameDate; text: string }[];
  /** 💬-prefixed passenger quotes that fired during the week. */
  letters: { date: GameDate; text: string }[];
  /** Stats deltas across the week. */
  flights: number;
  passengers: number;
  revenue: number;
  fuel: number;
  /** Ledger deltas + end-of-week totals. */
  cashDelta: number;
  cashEnd: number;
  reputationDelta: number;
  reputationEnd: number;
  netWorthDelta: number;
  netWorthEnd: number;
  /** Snapshot of the human's currently-active sponsor contracts (in progress). */
  sponsorActive: SponsorContract[];
  /** Sponsor contracts that resolved during the week (completed / failed /
   *  expired) — newest entries from state.sponsorCompleted since the last
   *  paper. Filtered to the human only. */
  sponsorResolved: SponsorContract[];
  /** Sponsor offers currently available, in case the player missed them. */
  sponsorOffers: SponsorContract[];
}

/**
 * Module-scope state. Persists across the page load but not across reloads.
 * Reset on new-game via `resetNewspaper()` so a second run on the same tab
 * starts fresh. On reload mid-week, the paper week effectively restarts —
 * acceptable for now; if we want save-survivable cadence we'll persist this
 * onto GameState later.
 */
let daysSincePaper = 0;
let lastSnap: WeekSnap | null = null;

function takeSnap(): WeekSnap {
  const s = GameState.get();
  const me = s.human;
  return {
    date: { ...s.date },
    flights: s.stats.flights,
    passengers: s.stats.passengers,
    revenue: s.stats.revenue,
    fuel: s.stats.fuel,
    cash: me.cash,
    reputation: me.reputation,
    netWorth: netWorth(me),
    sponsorCompletedLen: s.sponsorCompleted.length,
  };
}

/** Comparable minute count since year 0. Same simplified-calendar math as
 *  Flights.dateToMinutes — duplicated to keep this module self-contained. */
function dateMin(d: GameDate): number {
  return ((((d.year * 12 + (d.month - 1)) * 30 + (d.day - 1)) * 24 + d.hour) * 60) + d.minute;
}

/**
 * Returns the week's `WeeklyPaper` data when today is a paper day, otherwise
 * null. Side effects: increments the day counter, snapshots stats on fire.
 * Call from a `clock.onDay` hook so it fires exactly once per game-day.
 *
 * The baseline snapshot is taken at game-start by `resetNewspaper()` rather
 * than lazily here — that's what makes the very first day-transition count
 * toward the 7-day total, so the first paper lands exactly 7 day-transitions
 * (a full game-week) after the run begins instead of 8.
 */
export function tickNewspaper(): WeeklyPaper | null {
  if (!lastSnap) {
    // Defensive — resetNewspaper() should have seeded this. If it didn't
    // (a code path I missed), bootstrap lazily here and skip this fire.
    lastSnap = takeSnap();
    return null;
  }
  daysSincePaper++;
  if (daysSincePaper < WEEK_DAYS) return null;

  const state = GameState.get();
  const now = takeSnap();
  const cutoffMin = dateMin(lastSnap.date);

  // News is unshift()'d on the way in — newest at index 0, oldest at end.
  // Filter to entries whose date is >= the start of this paper's window.
  const recent = state.news.filter(n => dateMin(n.date) >= cutoffMin);
  const letters   = recent.filter(n =>  n.text.startsWith('💬'));
  const headlines = recent.filter(n => !n.text.startsWith('💬'));

  const me = state.human;
  const resolvedThisWeek = state.sponsorCompleted
    .slice(lastSnap.sponsorCompletedLen)
    .filter(s => s.ownerId === me.id);
  const activeForMe = state.sponsorActive.filter(s => s.ownerId === me.id);

  const paper: WeeklyPaper = {
    weekStartDate: { ...lastSnap.date },
    weekEndDate:   { ...now.date },
    headlines: headlines.slice(0, 8),
    letters:   letters.slice(0, 5),
    flights:    now.flights    - lastSnap.flights,
    passengers: now.passengers - lastSnap.passengers,
    revenue:    now.revenue    - lastSnap.revenue,
    fuel:       now.fuel       - lastSnap.fuel,
    cashDelta:        now.cash       - lastSnap.cash,
    cashEnd:          now.cash,
    reputationDelta:  now.reputation - lastSnap.reputation,
    reputationEnd:    now.reputation,
    netWorthDelta:    now.netWorth   - lastSnap.netWorth,
    netWorthEnd:      now.netWorth,
    sponsorActive:    activeForMe,
    sponsorResolved:  resolvedThisWeek,
    sponsorOffers:    [...state.sponsorOffers],
  };

  lastSnap = now;
  daysSincePaper = 0;
  return paper;
}

/** Reset between runs. Called from BootScene.go() so starting a fresh game
 *  (or reverting to title and starting again) doesn't inherit a baseline
 *  snapshot from the previous run. Takes the baseline snapshot immediately
 *  so the very first day-transition counts toward the week — without this
 *  the first onDay fire would just-and-only seed the baseline, costing the
 *  player one extra day of waiting before the first paper. */
export function resetNewspaper(): void {
  daysSincePaper = 0;
  lastSnap = takeSnap();
  pending = null;
}

/**
 * Set when `tickNewspaper` produces a paper. HUDScene polls
 * `consumePendingPaper()` each tick and launches NewspaperScene when one is
 * available. Kept here (rather than on GameState) because it's transient UI
 * state that shouldn't be persisted with the save.
 */
let pending: WeeklyPaper | null = null;

/** Wire the daily hook. Registered once per page load from BootScene. */
export function registerNewspaperHooks(): void {
  clock.onDay(() => {
    if (!GameState.get().settings.showWeeklyPaper) return;
    const paper = tickNewspaper();
    if (paper) pending = paper;
  });
}

/** Read-and-clear the pending paper. Called from HUDScene.update(). */
export function consumePendingPaper(): WeeklyPaper | null {
  const p = pending;
  pending = null;
  return p;
}
