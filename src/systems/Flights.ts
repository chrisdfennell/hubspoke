import { GameState, GameDate } from '../state/GameState';
import { Plane } from '../state/Plane';
import { Route } from '../state/Route';
import { flightMinutes, flightProfit, expectedLoadFactor, migrateBalance, fuelCost } from './Economy';
import { maxPlanesStaffed } from './Personnel';
import { sound } from './Sound';
import { clock } from './Clock';
import { distanceKm, getCity } from '../state/catalog';
import { Player } from '../state/Player';

/** Convert a GameDate to a comparable minute count since year 0. Simplified. */
function dateToMinutes(d: GameDate): number {
  return ((((d.year * 12 + (d.month - 1)) * 30 + (d.day - 1)) * 24 + d.hour) * 60) + d.minute;
}

/** Try to dispatch idle planes that have a route assigned. */
export function dispatchIdlePlanes() {
  // Lazy one-shot: if a legacy save predates the latest balance pass, fix it
  // up before the very next dispatch tick so cheap-priced routes don't keep
  // bleeding the player.
  migrateBalance();

  const state = GameState.get();
  const now = dateToMinutes(state.date);
  const settings = state.settings;

  for (const player of state.players) {
    // Crew constraint: only the first N planes (by index) get to fly when
    // understaffed. This keeps behavior deterministic so the player can
    // reorganize routes meaningfully in the Personnel room.
    const staffCap = maxPlanesStaffed(player);
    let dispatched = 0;
    // Count planes already in the air toward the cap so they don't double-count.
    const inAir = player.planes.filter(p =>
      p.status.kind === 'flying' || p.status.kind === 'cargo' || p.status.kind === 'ferry'
    ).length;

    for (const plane of player.planes) {
      const status = plane.status;
      if (status.kind !== 'idle' || !plane.routeId) continue;
      if (inAir + dispatched >= staffCap) break;
      const route = player.routes.find(r => r.id === plane.routeId);
      if (!route) continue;

      // Plane must currently be sitting at one of the route's endpoints.
      // Otherwise it'd "teleport" mid-flight — happens when a player reassigns
      // a plane parked at hub A to a route that runs B↔C.
      const at = status.airportId;
      if (at !== route.fromCity && at !== route.toCity) continue;

      // Player-only dispatch filters: skip flights the user has chosen to gate.
      // (AI rivals always fly so they don't go inert mid-game.)
      if (!player.isAI) {
        if (settings.minLoadFactorForTakeoff > 0
            && expectedLoadFactor(route) < settings.minLoadFactorForTakeoff) {
          continue;
        }
        if (settings.skipUnprofitable && flightProfit(plane, route).profit < 0) {
          continue;
        }
      }

      dispatched += 1;
      const from = at;
      const to = from === route.fromCity ? route.toCity : route.fromCity;
      const minutes = flightMinutes(plane, route.distanceKm);
      plane.status = {
        kind: 'flying',
        routeId: route.id,
        from,
        to,
        departedAt: now,
        arrivesAt: now + minutes,
      };
      if (!player.isAI) sound.play('takeoff');
    }
  }
}

/** Land planes whose arrival time has passed; pay revenue. */
export function landArrivedPlanes() {
  const state = GameState.get();
  const now = dateToMinutes(state.date);

  for (const player of state.players) {
    for (const plane of player.planes) {
      const status = plane.status;
      if (status.kind === 'flying') {
        if (now < status.arrivesAt) continue;
        const route = player.routes.find(r => r.id === status.routeId);
        const arrivedAt = status.to;
        if (!route) {
          plane.status = { kind: 'idle', airportId: arrivedAt };
          continue;
        }
        const result = flightProfit(plane, route);
        player.cash += result.profit;
        // Per-flight wear: small. A Cessna doing 20-30 flights a day used to lose
        // 10-15% condition daily; now it loses 2-3%, so a plane lasts roughly a
        // month of heavy use before needing a serious overhaul.
        plane.condition = Math.max(0, plane.condition - 0.001);
        plane.status = { kind: 'idle', airportId: arrivedAt };
        if (!player.isAI) {
          const sign = result.profit >= 0 ? '+' : '';
          state.pushNews(
            `${plane.name} arrived in ${arrivedAt.toUpperCase()} — ${result.passengers} pax, ${sign}$${Math.round(result.profit).toLocaleString('en-US')}.`
          );
          sound.play('land');
        }
      } else if (status.kind === 'ferry') {
        if (now < status.arrivesAt) continue;
        const arrivedAt = status.to;
        // Half the per-flight wear of a revenue flight — no pax cycles.
        plane.condition = Math.max(0, plane.condition - 0.0005);
        plane.status = { kind: 'idle', airportId: arrivedAt };
        if (!player.isAI) {
          state.pushNews(`${plane.name} repositioned to ${getCity(arrivedAt).name}.`);
          sound.play('land');
        }
      }
    }
  }
}

/**
 * Begin a non-revenue ferry flight from the plane's current airport to one of
 * the player's owned hubs. Pays fuel cost upfront. Returns ok:false with a
 * reason when the move can't happen (already moving, not your hub, out of
 * range, can't afford).
 */
export function dispatchFerry(player: Player, plane: Plane, toHubId: string): { ok: boolean; reason?: string } {
  if (plane.status.kind !== 'idle') return { ok: false, reason: 'Plane is not idle.' };
  const fromId = plane.status.airportId;
  if (fromId === toHubId) return { ok: false, reason: 'Plane is already at that hub.' };
  if (!player.hubs.includes(toHubId)) return { ok: false, reason: 'Destination is not one of your hubs.' };

  const a = getCity(fromId);
  const b = getCity(toHubId);
  const dist = distanceKm(a, b);
  if (dist > plane.model.range) return { ok: false, reason: `Out of range — needs ${Math.ceil(dist)} km, plane has ${plane.model.range}.` };

  const cost = Math.round(fuelCost(plane, dist));
  if (player.cash < cost) return { ok: false, reason: `Need $${cost.toLocaleString('en-US')} for fuel.` };

  const minutes = flightMinutes(plane, dist);
  const nowMin = dateToMinutes(GameState.get().date);
  player.cash -= cost;
  plane.status = {
    kind: 'ferry',
    from: fromId,
    to: toHubId,
    departedAt: nowMin,
    arrivesAt: nowMin + minutes,
  };
  if (!player.isAI) {
    GameState.get().pushNews(`${plane.name} ferrying ${a.name} → ${b.name} (fuel −$${cost.toLocaleString('en-US')}).`);
    sound.play('takeoff');
  }
  return { ok: true };
}

export function registerFlightHooks() {
  clock.onTick(() => {
    landArrivedPlanes();
    dispatchIdlePlanes();
  });
}

/** Helper for UI: human-readable status. */
export function planeStatusText(plane: Plane, route: Route | undefined): string {
  const status = plane.status;
  switch (status.kind) {
    case 'idle':
      return `Idle @ ${status.airportId.toUpperCase()}${route ? ` (route ${route.fromCity.toUpperCase()}↔${route.toCity.toUpperCase()})` : ''}`;
    case 'flying':
      return `Flying ${status.from.toUpperCase()} → ${status.to.toUpperCase()}`;
    case 'cargo':
      return `Cargo ${status.from.toUpperCase()} → ${status.to.toUpperCase()}`;
    case 'maintenance':
      return `In maintenance @ ${status.airportId.toUpperCase()}`;
    case 'ferry':
      return `Ferrying ${status.from.toUpperCase()} → ${status.to.toUpperCase()}`;
  }
}
