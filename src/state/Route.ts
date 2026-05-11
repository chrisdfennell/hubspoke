let _nextId = 1;
export function newRouteId(): string {
  return `r${_nextId++}`;
}

export function setRouteIdCounter(n: number) {
  _nextId = Math.max(_nextId, n);
}

export function getRouteIdCounter(): number {
  return _nextId;
}

export interface RouteSnapshot {
  id: string;
  ownerId: string;
  fromCity: string;
  toCity: string;
  distanceKm: number;
  ticketPrice: number;
  /** Lifetime tallies — accumulated per successful arrival of the owner.
   *  Optional in snapshot for save-compat with pre-tracking routes. */
  lifetimeFlights?: number;
  lifetimePassengers?: number;
  lifetimeRevenue?: number;
  lifetimeFuel?: number;
  lifetimeProfit?: number;
}

export class Route {
  id: string;
  fromCity: string;
  toCity: string;
  /** Ticket price in $. Set by player. */
  ticketPrice: number;
  /** Distance km, cached. */
  distanceKm: number;
  /** Airline id (owner). */
  ownerId: string;

  /** Lifetime tallies — bumped on every successful arrival by Flights. */
  lifetimeFlights: number = 0;
  lifetimePassengers: number = 0;
  lifetimeRevenue: number = 0;
  lifetimeFuel: number = 0;
  lifetimeProfit: number = 0;

  constructor(ownerId: string, fromCity: string, toCity: string, distanceKm: number, ticketPrice: number) {
    this.id = newRouteId();
    this.ownerId = ownerId;
    this.fromCity = fromCity;
    this.toCity = toCity;
    this.distanceKm = distanceKm;
    this.ticketPrice = ticketPrice;
  }

  toJSON(): RouteSnapshot {
    return {
      id: this.id,
      ownerId: this.ownerId,
      fromCity: this.fromCity,
      toCity: this.toCity,
      distanceKm: this.distanceKm,
      ticketPrice: this.ticketPrice,
      lifetimeFlights: this.lifetimeFlights,
      lifetimePassengers: this.lifetimePassengers,
      lifetimeRevenue: this.lifetimeRevenue,
      lifetimeFuel: this.lifetimeFuel,
      lifetimeProfit: this.lifetimeProfit,
    };
  }

  static fromJSON(s: RouteSnapshot): Route {
    const r = Object.create(Route.prototype) as Route;
    r.id = s.id;
    r.ownerId = s.ownerId;
    r.fromCity = s.fromCity;
    r.toCity = s.toCity;
    r.distanceKm = s.distanceKm;
    r.ticketPrice = s.ticketPrice;
    r.lifetimeFlights    = s.lifetimeFlights    ?? 0;
    r.lifetimePassengers = s.lifetimePassengers ?? 0;
    r.lifetimeRevenue    = s.lifetimeRevenue    ?? 0;
    r.lifetimeFuel       = s.lifetimeFuel       ?? 0;
    r.lifetimeProfit     = s.lifetimeProfit     ?? 0;
    const num = parseInt(s.id.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) setRouteIdCounter(num + 1);
    return r;
  }
}
