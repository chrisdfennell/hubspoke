import { Plane, PlaneSnapshot } from './Plane';
import { Route, RouteSnapshot } from './Route';
import { CityData, HOME_AIRPORT } from './catalog';

/** Default apron gates per hub before any expansions are bought. */
export const STARTING_GATES = 8;
/** Hard cap: an apron fits this many evenly-spaced gates in one row. Bumping
 *  this means revisiting AirportScene's gate-box geometry (gates would either
 *  shrink below the 56-px box width or wrap to a second row). */
export const MAX_GATES_PER_HUB = 12;

/** Cost in $ to add the (currentGates + 1)-th gate to a hub. Escalates per
 *  gate and scales with hub demand so big-market hubs cost more. Gate 9 at a
 *  ×1.0 hub = $2M; gate 12 at the same hub = $5M. Returns Infinity if the
 *  hub is already at the cap. */
export function gateExpansionCost(currentGates: number, hub: CityData): number {
  if (currentGates >= MAX_GATES_PER_HUB) return Infinity;
  // (currentGates - 6) gives 2, 3, 4, 5 for the 9th..12th gate.
  return Math.round((currentGates - 6) * 1_000_000 * hub.demand);
}

/** Cost in $ to open a new hub at `city`. Scales with city demand so a
 *  big market (JFK at 1.5) costs $7.5M while a backwater costs less.
 *  Shared between the human's WorldMapScene buy panel and the AI's
 *  expansion logic so both pay the same. */
export function hubCost(city: CityData): number {
  return Math.round(city.demand * 5_000_000);
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: number;
  cash: number;
  loan: number;
  savings: number;
  reputation: number;
  isAI: boolean;
  planes: PlaneSnapshot[];
  routes: RouteSnapshot[];
  /** Crew counts. Each pilot/mechanic supports one plane. */
  pilots: number;
  mechanics: number;
  /** Share holdings keyed by airline id. */
  holdings: Record<string, number>;
  /** Inventory keyed by item id → count. */
  inventory: Record<string, number>;
  /** City ids the airline operates out of. First entry is the primary home.
   *  Optional for backwards compat — pre-multi-hub saves get [HOME_AIRPORT]. */
  hubs?: string[];
  /** Apron gates per hub. Missing entries default to STARTING_GATES. */
  gateCounts?: Record<string, number>;
  /** CEO id (see ceos.ts). Only the human typically has one; AI rivals
   *  leave it unset. Optional for backwards-compat with pre-CEO saves. */
  ceoId?: string;
  /** Day-count (year*360+month*30+day) of the last time each Duty Free
   *  boost item was used. Cooldown is one game-day per item — keeps the
   *  player from buying ten Marketing Campaigns in a row to swing rep. */
  boostUsedOn?: Record<string, number>;
  /** When > 0, daily hook auto-deposits any cash above this threshold. */
  autoSaveAboveCash?: number;
  /** When > 0, daily hook auto-withdraws from savings to top cash up to this. */
  autoWithdrawBelowCash?: number;
  /** Consecutive missed monthly loan payments. Hits 3 → creditors seize. */
  missedLoanPayments?: number;
  /** Per-share quarterly dividend this airline pays. 0 = no dividend. */
  dividendPerShare?: number;
  /** Game-day index of the most recent dividend payment. Next dividend
   *  pays out 90 days after this. */
  lastDividendDay?: number;
  /** Crew morale 0..100. Drops when crew is overworked or after
   *  crashes/incidents; recovers slowly when rested. Drives passenger
   *  load-factor adjustment + mishap chance multiplier. */
  morale?: number;
}

export class Player {
  id: string;
  name: string;
  color: number;
  /** Cash in $. */
  cash: number;
  /** Outstanding loan principal. */
  loan: number;
  /** Money in interest-bearing savings. */
  savings: number;
  /** Reputation 0..100. */
  reputation: number;
  /** True if controlled by AI rather than the local human. */
  isAI: boolean;

  planes: Plane[] = [];
  routes: Route[] = [];

  /** Number of pilots employed (each plane needs one to fly). */
  pilots: number;
  /** Number of mechanics employed (each plane needs one). */
  mechanics: number;

  /** Holdings: how many shares of which airline this player owns. */
  holdings: Record<string, number> = {};

  /** Inventory of items keyed by item id → count. */
  inventory: Record<string, number> = {};

  /** Cities this airline operates out of. hubs[0] is the primary home airport
   *  — the one the AirportScene renders by default. */
  hubs: string[] = [HOME_AIRPORT];

  /** Apron gates owned at each hub. Entries that aren't present default to
   *  STARTING_GATES (8). Bought through Travel Agency → Airport tab. */
  gateCounts: Record<string, number> = {};

  /** CEO id (see ceos.ts). Set at new-game time; perks are read live from
   *  the catalog. AI rivals leave this undefined. */
  ceoId?: string;

  /** Per-boost-item last-use day, gating the daily cooldown in Duty Free. */
  boostUsedOn: Record<string, number> = {};

  /** Auto-deposit threshold: any cash above this is moved to savings on the
   *  daily hook. Zero disables the rule. */
  autoSaveAboveCash: number = 0;
  /** Auto-withdrawal threshold: if cash drops below this and savings has
   *  funds, top cash up to (or as close as savings allows). Zero disables. */
  autoWithdrawBelowCash: number = 0;

  /** Consecutive missed monthly loan principal payments. Resets to 0 on a
   *  successful payment; at 3, the airline is seized by creditors. */
  missedLoanPayments: number = 0;

  /** Per-share quarterly dividend this airline pays to all shareholders.
   *  Stocks.payDividends() drains issuer cash + credits holders every 90
   *  in-game days. Zero (default) = no dividend. */
  dividendPerShare: number = 0;
  /** Game-day index of the last dividend payment. Set when the player
   *  declares a dividend so the first payout is one full quarter out. */
  lastDividendDay: number = 0;

  /** Crew morale 0..100. Starts at 70 (decent), drops when crew is
   *  overworked (more planes flying than pilots can handle) or after
   *  crashes/incidents, recovers ~+2/day when rested. Drives a small
   *  load-factor adjustment + mishap-chance multiplier on flights. */
  morale: number = 70;

  /** Number of apron gates available at the given hub. */
  gatesAt(hubId: string): number {
    return this.gateCounts[hubId] ?? STARTING_GATES;
  }

  constructor(id: string, name: string, color: number, isAI: boolean, startCash: number, homeHub: string = HOME_AIRPORT) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isAI = isAI;
    this.cash = startCash;
    this.loan = 0;
    this.savings = 0;
    this.reputation = 50;
    this.pilots = 0;
    this.mechanics = 0;
    this.hubs = [homeHub];
  }

  toJSON(): PlayerSnapshot {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      cash: this.cash,
      loan: this.loan,
      savings: this.savings,
      reputation: this.reputation,
      isAI: this.isAI,
      planes: this.planes.map(p => p.toJSON()),
      routes: this.routes.map(r => r.toJSON()),
      pilots: this.pilots,
      mechanics: this.mechanics,
      holdings: { ...this.holdings },
      inventory: { ...this.inventory },
      hubs: [...this.hubs],
      gateCounts: { ...this.gateCounts },
      ceoId: this.ceoId,
      boostUsedOn: { ...this.boostUsedOn },
      autoSaveAboveCash: this.autoSaveAboveCash,
      autoWithdrawBelowCash: this.autoWithdrawBelowCash,
      missedLoanPayments: this.missedLoanPayments,
      dividendPerShare: this.dividendPerShare,
      lastDividendDay: this.lastDividendDay,
      morale: this.morale,
    };
  }

  static fromJSON(s: PlayerSnapshot): Player {
    const p = Object.create(Player.prototype) as Player;
    p.id = s.id;
    p.name = s.name;
    p.color = s.color;
    p.cash = s.cash;
    p.loan = s.loan;
    p.savings = s.savings ?? 0;
    p.reputation = s.reputation;
    p.isAI = s.isAI;
    p.planes = s.planes.map(Plane.fromJSON);
    p.routes = s.routes.map(Route.fromJSON);
    p.pilots = s.pilots ?? 0;
    p.mechanics = s.mechanics ?? 0;
    p.holdings = { ...(s.holdings ?? {}) };
    p.inventory = { ...(s.inventory ?? {}) };
    p.hubs = (s.hubs && s.hubs.length > 0) ? [...s.hubs] : [HOME_AIRPORT];
    p.gateCounts = { ...(s.gateCounts ?? {}) };
    p.ceoId = s.ceoId;
    p.boostUsedOn = { ...(s.boostUsedOn ?? {}) };
    p.autoSaveAboveCash = s.autoSaveAboveCash ?? 0;
    p.autoWithdrawBelowCash = s.autoWithdrawBelowCash ?? 0;
    p.missedLoanPayments = s.missedLoanPayments ?? 0;
    p.dividendPerShare = s.dividendPerShare ?? 0;
    p.lastDividendDay = s.lastDividendDay ?? 0;
    p.morale = s.morale ?? 70;
    return p;
  }
}
