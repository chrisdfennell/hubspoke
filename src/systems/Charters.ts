import { GameState, GameDate } from '../state/GameState';
import { Player } from '../state/Player';
import { Plane } from '../state/Plane';
import { CITIES, distanceKm, getCity, getPlaneModel } from '../state/catalog';
import { flightMinutes, fuelCost, suggestedTicketPrice } from './Economy';
import { CharterContract } from '../state/Charter';
import { dateToDay } from '../state/demandModifiers';
import { clock } from './Clock';

let _counter = 1;
const nextCharterId = () => `ch${_counter++}`;
export function setCharterCounter(n: number) { _counter = Math.max(_counter, n); }
export function getCharterCounter(): number { return _counter; }

const MAX_OFFERS = 6;

/** Premium multiplier on top of the equivalent fair-ticket revenue.
 *  Real charters pay a premium for guaranteed bulk seats + scheduling
 *  flexibility, so a charter pays ~1.5× what filling the same seats
 *  at fair fare would yield. Tweak in lockstep with `MAX_OFFERS` and
 *  any future difficulty knobs for charter aggression. */
const CHARTER_PREMIUM = 1.5;

/** Roll one fresh charter offer from a city pair. Pax count is sized
 *  to fall within plausible plane-class capacities (40..400 range so
 *  small turboprops and large widebodies both get matched). */
function rollCharter(state: GameState): CharterContract {
  const a = CITIES[Math.floor(Math.random() * CITIES.length)];
  let b = CITIES[Math.floor(Math.random() * CITIES.length)];
  while (b.id === a.id) b = CITIES[Math.floor(Math.random() * CITIES.length)];

  const dist = distanceKm(a, b);
  // Pax: 40 to 400, weighted toward middle of that range.
  const paxCount = Math.round(40 + Math.random() * 360);
  const fair = suggestedTicketPrice(dist, a.demand, b.demand);
  const payment = Math.round(paxCount * fair * CHARTER_PREMIUM);

  // Lead time: 2-7 days. Longer than cargo so they're realistic to
  // re-position a plane for.
  const today = dateToDay(state.date);
  const dueDay = today + 2 + Math.floor(Math.random() * 6);

  return {
    id: nextCharterId(),
    fromCity: a.id,
    toCity: b.id,
    paxCount,
    payment,
    dueDay,
    penalty: Math.round(payment * 0.5),
    repPenalty: 3,
    status: 'available',
  };
}

/** Daily refresh: prune expired offers and top up to MAX_OFFERS. */
export function refreshCharterOffers() {
  const state = GameState.get();
  const today = dateToDay(state.date);
  state.charterOffers = state.charterOffers.filter(o =>
    o.status === 'available' && o.dueDay > today,
  );
  while (state.charterOffers.length < MAX_OFFERS) {
    state.charterOffers.push(rollCharter(state));
  }
}

/** Move an available offer to the player's active list. */
export function acceptCharter(player: Player, contractId: string): boolean {
  const state = GameState.get();
  const idx = state.charterOffers.findIndex(c => c.id === contractId);
  if (idx < 0) return false;
  const c = state.charterOffers[idx];
  if (c.status !== 'available') return false;
  c.status = 'active';
  c.ownerId = player.id;
  state.charterOffers.splice(idx, 1);
  state.charterActive.push(c);
  return true;
}

/**
 * Dispatch a plane to fulfil an active charter. Same shape as cargo
 * dispatch: plane positions empty from its current airport to `from`,
 * then carries the charter pax from `from` to `to`. Charges fuel for
 * both legs up front; plane lands idle at `to` when arrivesAt clears.
 */
export function dispatchCharter(player: Player, contractId: string, planeId: string): { ok: true } | { ok: false; reason: string } {
  const state = GameState.get();
  const contract = state.charterActive.find(c => c.id === contractId && c.ownerId === player.id);
  if (!contract) return { ok: false, reason: 'Contract not found' };
  if (contract.assignedPlaneId) return { ok: false, reason: 'Already assigned' };
  const plane = player.planes.find(p => p.id === planeId);
  if (!plane) return { ok: false, reason: 'Plane not found' };
  if (plane.status.kind !== 'idle') return { ok: false, reason: 'Plane is not idle' };
  const model = getPlaneModel(plane.modelId);
  if (model.seats < contract.paxCount) return { ok: false, reason: 'Not enough seats' };

  const from = getCity(contract.fromCity);
  const to = getCity(contract.toCity);
  const here = getCity(plane.status.airportId);
  if (model.range < distanceKm(from, to)) return { ok: false, reason: 'Plane range insufficient' };

  const totalDist = distanceKm(here, from) + distanceKm(from, to);
  const fuel = fuelCost(plane, totalDist);
  if (player.cash < fuel) return { ok: false, reason: 'Cannot afford fuel' };
  player.cash -= fuel;

  const minutes = flightMinutes(plane, totalDist);
  const now = dateToMinutes(state.date);
  plane.status = {
    kind: 'charter',
    contractId: contract.id,
    from: contract.fromCity,
    to: contract.toCity,
    departedAt: now,
    arrivesAt: now + minutes,
  };
  contract.assignedPlaneId = plane.id;
  return { ok: true };
}

/** Land any charter flights whose arrival time has passed; pay out
 *  the contract and idle the plane at the destination. */
export function landArrivedCharters() {
  const state = GameState.get();
  const now = dateToMinutes(state.date);
  for (const player of state.players) {
    for (const plane of player.planes) {
      const status = plane.status;
      if (status.kind !== 'charter') continue;
      if (now < status.arrivesAt) continue;
      const contract = state.charterActive.find(c => c.id === status.contractId);
      if (!contract) {
        plane.status = { kind: 'idle', airportId: status.to };
        continue;
      }
      player.cash += contract.payment;
      player.reputation = Math.min(100, player.reputation + 1);
      plane.condition = Math.max(0, plane.condition - 0.005);
      plane.status = { kind: 'idle', airportId: status.to };
      contract.status = 'delivered';
      const idx = state.charterActive.findIndex(c => c.id === contract.id);
      if (idx >= 0) state.charterActive.splice(idx, 1);
      state.charterCompleted.unshift(contract);
      if (state.charterCompleted.length > 80) state.charterCompleted.length = 80;
      if (!player.isAI) {
        state.pushNews(`Charter delivered ${getCity(contract.fromCity).name} → ${getCity(contract.toCity).name} (${contract.paxCount} pax): +$${contract.payment.toLocaleString('en-US')}`);
      }
    }
  }
}

/** Expire active contracts whose deadline passed without dispatch. */
export function expireMissedCharters() {
  const state = GameState.get();
  const today = dateToDay(state.date);
  for (let i = state.charterActive.length - 1; i >= 0; i--) {
    const c = state.charterActive[i];
    if (c.dueDay >= today) continue;
    if (c.status !== 'active') continue;
    if (c.assignedPlaneId) continue; // in-flight contracts honor the deadline
    const player = state.players.find(p => p.id === c.ownerId);
    if (player) {
      player.cash -= c.penalty;
      player.reputation = Math.max(0, player.reputation - c.repPenalty);
      if (!player.isAI) {
        state.pushNews(`Charter ${c.id} expired — −$${c.penalty.toLocaleString('en-US')}, reputation −${c.repPenalty}.`);
      }
    }
    c.status = 'failed';
    state.charterActive.splice(i, 1);
    state.charterCompleted.unshift(c);
  }
}

function dateToMinutes(d: GameDate): number {
  return ((((d.year * 12 + (d.month - 1)) * 30 + (d.day - 1)) * 24 + d.hour) * 60) + d.minute;
}

export function registerCharterHooks() {
  clock.onDay(() => {
    refreshCharterOffers();
    expireMissedCharters();
  });
  clock.onTick(() => landArrivedCharters());
}

/** UI helper — short status label for the apron / fleet displays. */
export function charterStatusText(plane: Plane): string {
  if (plane.status.kind !== 'charter') return '';
  return `Charter ${plane.status.from.toUpperCase()} → ${plane.status.to.toUpperCase()}`;
}
