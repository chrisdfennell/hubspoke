import { GameState, GameDate } from '../state/GameState';
import { Player } from '../state/Player';
import { Plane } from '../state/Plane';
import { CITIES, distanceKm, getCity, getPlaneModel } from '../state/catalog';
import { flightMinutes, fuelCost, getFuelPrice } from './Economy';
import { dateToDay } from '../state/demandModifiers';
import { clock } from './Clock';

export type CargoStatus = 'available' | 'active' | 'delivered' | 'failed';

export interface CargoContract {
  id: string;
  fromCity: string;
  toCity: string;
  weightKg: number;
  payment: number;
  /** Game-day index when the contract expires unfulfilled. */
  dueDay: number;
  /** Penalty (in $) charged on failure. */
  penalty: number;
  /** Reputation hit on failure. */
  repPenalty: number;
  status: CargoStatus;
  /** Acquiring player id (for active/delivered/failed). */
  ownerId?: string;
  /** Plane currently flying it. */
  assignedPlaneId?: string;
}

let _contractCounter = 1;
const nextContractId = () => `c${_contractCounter++}`;

const MAX_OFFERS = 8;

/** Generate one random contract from a city we know about. */
function rollContract(state: GameState): CargoContract {
  const a = CITIES[Math.floor(Math.random() * CITIES.length)];
  let b = CITIES[Math.floor(Math.random() * CITIES.length)];
  while (b.id === a.id) b = CITIES[Math.floor(Math.random() * CITIES.length)];

  const dist = distanceKm(a, b);
  // Weight scales by distance, in kg. Tighter for short hops.
  const weightKg = Math.round(500 + Math.random() * Math.min(20_000, dist * 6));
  // Payment scales with distance × weight.
  const ratePerKgKm = 0.0012 + Math.random() * 0.0006; // $0.0012 - $0.0018 per kg-km
  const payment = Math.round(dist * weightKg * ratePerKgKm);
  // Deadline: enough time for a slow plane to fly there.
  const today = dateToDay(state.date);
  const days = 2 + Math.floor(Math.random() * 6); // 2-7 days
  const dueDay = today + days;
  return {
    id: nextContractId(),
    fromCity: a.id,
    toCity: b.id,
    weightKg,
    payment,
    dueDay,
    penalty: Math.round(payment * 0.5),
    repPenalty: 3,
    status: 'available',
  };
}

/** Top up the offer pool to MAX_OFFERS. Called daily. */
export function refreshOffers() {
  const state = GameState.get();
  state.cargoOffers = state.cargoOffers.filter(o => o.status === 'available' && o.dueDay > dateToDay(state.date));
  while (state.cargoOffers.length < MAX_OFFERS) {
    state.cargoOffers.push(rollContract(state));
  }
}

/** Player accepts an offer. */
export function acceptContract(player: Player, contractId: string): boolean {
  const state = GameState.get();
  const idx = state.cargoOffers.findIndex(c => c.id === contractId);
  if (idx < 0) return false;
  const c = state.cargoOffers[idx];
  if (c.status !== 'available') return false;
  c.status = 'active';
  c.ownerId = player.id;
  state.cargoOffers.splice(idx, 1);
  state.cargoActive.push(c);
  return true;
}

/** Dispatch a plane to fulfill a contract. Plane must be idle and capable. */
export function dispatchCargo(player: Player, contractId: string, planeId: string): { ok: true } | { ok: false; reason: string } {
  const state = GameState.get();
  const contract = state.cargoActive.find(c => c.id === contractId && c.ownerId === player.id);
  if (!contract) return { ok: false, reason: 'Contract not found' };
  if (contract.assignedPlaneId) return { ok: false, reason: 'Already assigned' };
  const plane = player.planes.find(p => p.id === planeId);
  if (!plane) return { ok: false, reason: 'Plane not found' };
  if (plane.status.kind !== 'idle') return { ok: false, reason: 'Plane is not idle' };
  const model = getPlaneModel(plane.modelId);
  if (model.cargoCapacityKg < contract.weightKg) return { ok: false, reason: 'Insufficient cargo capacity' };

  const from = getCity(contract.fromCity);
  const to = getCity(contract.toCity);
  // Plane may need a positioning leg first if it's not at the contract's origin.
  const here = getCity(plane.status.airportId);
  const totalDist = distanceKm(here, from) + distanceKm(from, to);
  if (model.range < distanceKm(from, to)) return { ok: false, reason: 'Plane range insufficient' };

  // Charge fuel for the full positioning + delivery up front (simplification).
  const fuel = fuelCost(plane, totalDist);
  if (player.cash < fuel) return { ok: false, reason: 'Cannot afford fuel' };
  player.cash -= fuel;

  const minutes = flightMinutes(plane, totalDist);
  const now = dateToMinutes(state.date);
  plane.status = {
    kind: 'cargo',
    contractId: contract.id,
    from: contract.fromCity,
    to: contract.toCity,
    departedAt: now,
    arrivesAt: now + minutes,
  };
  contract.assignedPlaneId = plane.id;
  void getFuelPrice; // referenced to ensure fuel-price changes reach future dispatches via fuelCost
  return { ok: true };
}

/** Land cargo flights whose arrival has passed; pay & resolve contract. */
export function landArrivedCargo() {
  const state = GameState.get();
  const now = dateToMinutes(state.date);
  for (const player of state.players) {
    for (const plane of player.planes) {
      const status = plane.status;
      if (status.kind !== 'cargo') continue;
      if (now < status.arrivesAt) continue;
      const contract = state.cargoActive.find(c => c.id === status.contractId);
      if (!contract) {
        plane.status = { kind: 'idle', airportId: status.to };
        continue;
      }
      // Deliver.
      player.cash += contract.payment;
      player.reputation = Math.min(100, player.reputation + 1);
      plane.condition = Math.max(0, plane.condition - 0.005);
      plane.status = { kind: 'idle', airportId: status.to };
      contract.status = 'delivered';
      // Move to delivered history.
      const idx = state.cargoActive.findIndex(c => c.id === contract.id);
      if (idx >= 0) state.cargoActive.splice(idx, 1);
      state.cargoCompleted.unshift(contract);
      if (state.cargoCompleted.length > 80) state.cargoCompleted.length = 80;
      if (!player.isAI) {
        state.pushNews(`Delivered cargo ${getCity(contract.fromCity).name} → ${getCity(contract.toCity).name}: +$${contract.payment.toLocaleString('en-US')}`);
      }
    }
  }
}

/** Daily: expire missed contracts. */
export function expireMissedContracts() {
  const state = GameState.get();
  const today = dateToDay(state.date);
  for (let i = state.cargoActive.length - 1; i >= 0; i--) {
    const c = state.cargoActive[i];
    if (c.dueDay >= today) continue;
    if (c.status !== 'active') continue;
    if (c.assignedPlaneId) continue; // in-flight contracts are honored even if past due
    const player = state.players.find(p => p.id === c.ownerId);
    if (player) {
      player.cash -= c.penalty;
      player.reputation = Math.max(0, player.reputation - c.repPenalty);
      if (!player.isAI) {
        state.pushNews(`Cargo contract ${c.id} expired — −$${c.penalty.toLocaleString('en-US')}, reputation −${c.repPenalty}.`);
      }
    }
    c.status = 'failed';
    state.cargoActive.splice(i, 1);
    state.cargoCompleted.unshift(c);
  }
}

function dateToMinutes(d: GameDate): number {
  return ((((d.year * 12 + (d.month - 1)) * 30 + (d.day - 1)) * 24 + d.hour) * 60) + d.minute;
}

export function registerCargoHooks() {
  clock.onDay(() => {
    refreshOffers();
    expireMissedContracts();
  });
  clock.onTick(() => landArrivedCargo());
}

/** Helper for UI: short status string. */
export function cargoStatusText(plane: Plane): string {
  if (plane.status.kind !== 'cargo') return '';
  return `Cargo ${plane.status.from.toUpperCase()} → ${plane.status.to.toUpperCase()}`;
}

export function setContractCounter(n: number) {
  _contractCounter = Math.max(_contractCounter, n);
}

export function getContractCounter(): number {
  return _contractCounter;
}
