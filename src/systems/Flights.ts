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

/** Per-player game-minute timestamp of the last successful dispatch.
 *  Used to stagger takeoffs so a fleet of N planes doesn't all leap off the
 *  apron in the same tick — without this the airport reads as bursty (all
 *  planes mid-flight together, then all idle together). 5 game-min ≈ 1s
 *  real-time at 1× speed. Module-scope is fine: cooldown resetting on a
 *  page reload is harmless. */
const lastDispatchAt: Record<string, number> = {};
const DISPATCH_STAGGER_MINUTES = 5;

/** Per-plane game-minute timestamp of the last landing. Used to enforce a
 *  minimum turnaround so a plane that just landed doesn't get redispatched
 *  in the same clock tick — landArrivedPlanes and dispatchIdlePlanes share
 *  an onTick callback, so without this gate the plane goes idle→flying in
 *  a single tick and AirportScene's checkStatusChanges() (which polls per
 *  frame) never observes the idle state, suppressing the landing AND the
 *  follow-up takeoff animation. 15 game-min ≈ 3s real-time at 1×, enough
 *  for the 2.8s landing animation to play plus a brief parked beat. */
const lastLandedAt: Record<string, number> = {};
const MIN_TURNAROUND_MINUTES = 15;

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
    // Stagger: skip this player entirely if they dispatched too recently.
    const lastT = lastDispatchAt[player.id] ?? -Infinity;
    if (now - lastT < DISPATCH_STAGGER_MINUTES) continue;

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

      // Turnaround gate: don't redispatch a plane that landed in the same
      // tick (or only a couple of ticks ago). Gives the per-frame
      // AirportScene poller time to observe the idle state and animate the
      // landing + boarding/takeoff beats. See comment on lastLandedAt above.
      const landedT = lastLandedAt[plane.id];
      if (landedT !== undefined && now - landedT < MIN_TURNAROUND_MINUTES) continue;

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

      // Stagger: only one plane per player per stagger window. Marker is set
      // here, after a successful state mutation, so a player whose only idle
      // plane was filtered out (wrong hub, threshold gate, etc.) doesn't get
      // unfairly cooldowned.
      lastDispatchAt[player.id] = now;
      break;
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
          lastLandedAt[plane.id] = now;
          continue;
        }
        const result = flightProfit(plane, route);
        player.cash += result.profit;
        // Per-flight wear: small. A Cessna doing 20-30 flights a day used to lose
        // 10-15% condition daily; now it loses 2-3%, so a plane lasts roughly a
        // month of heavy use before needing a serious overhaul.
        plane.condition = Math.max(0, plane.condition - 0.001);
        plane.status = { kind: 'idle', airportId: arrivedAt };
        lastLandedAt[plane.id] = now;
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
        lastLandedAt[plane.id] = now;
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
  // Daily auto-repair sweep: gated by settings.autoRepairThreshold (0 = off).
  // Mirrors the Workshop "Repair" button — full restore to 100% condition,
  // charged at 2% × price × (1 − condition). Only the human's planes are
  // touched; AI rivals manage their own (lack of) maintenance.
  clock.onDay(() => {
    const state = GameState.get();
    const threshold = state.settings.autoRepairThreshold;
    if (threshold <= 0) return;
    const me = state.human;
    for (const plane of me.planes) {
      if (plane.status.kind !== 'idle') continue;
      if (plane.condition >= threshold) continue;
      const cost = Math.round((1 - plane.condition) * plane.model.price * 0.02);
      if (me.cash < cost) {
        state.pushNews(
          `${plane.name} below auto-repair threshold but funds short (need ${'$' + cost.toLocaleString('en-US')}).`,
        );
        continue;
      }
      me.cash -= cost;
      plane.condition = 1.0;
      state.pushNews(
        `${plane.name} auto-repaired to 100% (−$${cost.toLocaleString('en-US')}).`,
      );
    }
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
