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
    const num = parseInt(s.id.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) setRouteIdCounter(num + 1);
    return r;
  }
}
