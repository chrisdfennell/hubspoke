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
    return p;
  }
}
