import { PlaneModel, getPlaneModel } from './catalog';
import { PlaneUpgrades } from './upgrades';

export type PlaneStatus =
  | { kind: 'idle'; airportId: string }
  | { kind: 'flying'; routeId: string; from: string; to: string; departedAt: number; arrivesAt: number }
  | { kind: 'cargo'; contractId: string; from: string; to: string; departedAt: number; arrivesAt: number }
  | { kind: 'charter'; contractId: string; from: string; to: string; departedAt: number; arrivesAt: number }
  | { kind: 'maintenance'; airportId: string; doneAt: number }
  /** Repositioning between hubs without revenue. Player-initiated; pays fuel
   *  upfront and the plane lands idle at `to`. */
  | { kind: 'ferry'; from: string; to: string; departedAt: number; arrivesAt: number };

let _nextId = 1;
export function newPlaneId(): string {
  return `p${_nextId++}`;
}

/** Used by save/load to ensure freshly-created planes don't collide with restored ids. */
export function setPlaneIdCounter(n: number) {
  _nextId = Math.max(_nextId, n);
}

export function getPlaneIdCounter(): number {
  return _nextId;
}

export interface PlaneSnapshot {
  id: string;
  modelId: string;
  condition: number;
  routeId: string | null;
  status: PlaneStatus;
  name: string;
  /** Equipped upgrades by category. Optional for backwards-compat with
   *  pre-upgrade saves. */
  upgrades?: PlaneUpgrades;
}

export class Plane {
  id: string;
  modelId: string;
  /** 0..1 — degrades with use, repaired in workshop. */
  condition: number;
  /** Assigned route id, or null if unassigned. */
  routeId: string | null;
  status: PlaneStatus;
  /** Display name the player can rename. */
  name: string;
  /** Equipped upgrades by category (livery / interior / entertainment).
   *  Each plane can hold at most one upgrade per category. Default empty. */
  upgrades: PlaneUpgrades = {};

  constructor(modelId: string, airportId: string, name?: string) {
    const m = getPlaneModel(modelId);
    this.id = newPlaneId();
    this.modelId = modelId;
    this.condition = m.conditionAtPurchase;
    this.routeId = null;
    this.status = { kind: 'idle', airportId };
    this.name = name ?? `${m.name} ${this.id.toUpperCase()}`;
    this.upgrades = {};
  }

  get model(): PlaneModel {
    return getPlaneModel(this.modelId);
  }

  toJSON(): PlaneSnapshot {
    return {
      id: this.id,
      modelId: this.modelId,
      condition: this.condition,
      routeId: this.routeId,
      status: this.status,
      name: this.name,
      upgrades: { ...this.upgrades },
    };
  }

  static fromJSON(s: PlaneSnapshot): Plane {
    // Bypass constructor's auto-id by allocating then overwriting.
    const p = Object.create(Plane.prototype) as Plane;
    p.id = s.id;
    p.modelId = s.modelId;
    p.condition = s.condition;
    p.routeId = s.routeId;
    p.status = s.status;
    p.name = s.name;
    p.upgrades = { ...(s.upgrades ?? {}) };
    // Bump counter so future newPlaneId() doesn't collide.
    const num = parseInt(s.id.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) setPlaneIdCounter(num + 1);
    return p;
  }
}
