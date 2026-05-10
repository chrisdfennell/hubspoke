import { Plane, PlaneSnapshot } from './Plane';
import { Route, RouteSnapshot } from './Route';
import { HOME_AIRPORT } from './catalog';

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
    return p;
  }
}
