import { GameState, GameDate } from '../state/GameState';
import { Plane } from '../state/Plane';
import { Route } from '../state/Route';
import { flightMinutes, flightProfit, expectedLoadFactor, migrateBalance, fuelCost } from './Economy';
import { maxPlanesStaffed } from './Personnel';
import { sound } from './Sound';
import { clock } from './Clock';
import { distanceKm, getCity } from '../state/catalog';
import { Player } from '../state/Player';
import { getCEO } from '../state/ceos';
import { planeReputationPerFlight } from '../state/upgrades';

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

/**
 * Roll for a mid-flight failure on a plane that just landed. Probability and
 * severity scale with how neglected the plane was — at >= 50% condition
 * nothing happens; below that, lower condition means higher chance of an
 * incident and a rising chance of a full crash. Only fires for revenue
 * flights (caller skips this for ferry repositioning).
 *
 * Outcomes:
 *   - Incident: plane forced to ≥50% condition via an emergency repair
 *     charged to the player; reputation −5; pax compensation $2k per seat.
 *   - Crash: plane removed from the fleet; reputation −25; pax compensation
 *     $10k per passenger on board.
 *
 * Mitigation: settings.autoRepairThreshold (daily sweep) catches planes
 * before they reach the danger zone if the player wants the hands-off route.
 */
function maybeMishap(player: Player, plane: Plane, passengers: number) {
  if (plane.condition >= 0.5) return;
  // Linear ramp from 0% chance at cond=0.5 to 20% at cond=0.0.
  const failChance = (0.5 - plane.condition) * 0.4;
  if (Math.random() >= failChance) return;

  const state = GameState.get();
  // Below 15% condition there's a 30% chance the incident is a full crash.
  const crashOdds = plane.condition < 0.15 ? 0.3 : 0;
  const crashed = Math.random() < crashOdds;

  if (crashed) {
    const paxLoss = passengers * 10_000;
    player.cash -= paxLoss;
    player.reputation = Math.max(0, player.reputation - 25);
    // Drop the plane from the fleet. routeId references go stale gracefully
    // — flightProfit / dispatch all key off the plane object itself.
    const idx = player.planes.indexOf(plane);
    if (idx >= 0) player.planes.splice(idx, 1);
    if (!player.isAI) {
      state.stats.crashes++;
      state.pushNews(
        `★ ${plane.name} (${player.name}) crashed — ${passengers} pax. ` +
        `Aircraft lost, reputation −25, ${formatPaxLoss(paxLoss)} in claims.`,
      );
      sound.play('alert');
    } else {
      state.pushNews(`${player.name} lost a plane (${plane.name}) in a crash.`);
    }
  } else {
    const paxLoss = passengers * 2_000;
    player.cash -= paxLoss;
    player.reputation = Math.max(0, player.reputation - 5);
    // Emergency repair to 50% — the plane lives but is grounded until the
    // player tops it up in the Workshop (or until auto-repair fires).
    plane.condition = Math.max(plane.condition, 0.5);
    if (!player.isAI) {
      state.stats.incidents++;
      state.pushNews(
        `⚠ ${plane.name} declared an emergency landing — pax compensated ${formatPaxLoss(paxLoss)}, ` +
        `reputation −5, plane patched to 50%.`,
      );
      sound.play('alert');
    }
  }
}

function formatPaxLoss(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
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
        // Career stat tracking — only for the human player; AI rivals
        // don't need a stats screen.
        if (!player.isAI) {
          state.stats.flights++;
          state.stats.passengers += result.passengers;
          state.stats.km += route.distanceKm;
          state.stats.revenue += result.revenue;
          state.stats.fuel += result.fuel;
          if (result.profit > state.stats.bestFlightProfit) state.stats.bestFlightProfit = result.profit;
          if (result.profit < state.stats.worstFlightLoss)  state.stats.worstFlightLoss  = result.profit;
        }
        // Per-flight wear: small. A Cessna doing 20-30 flights a day used to
        // lose 10-15% condition daily; now it loses 2-3%, so a plane lasts
        // roughly a month of heavy use before needing a serious overhaul.
        // Igor's CEO perk halves this decay rate.
        const decayMult = getCEO(player.ceoId)?.perks.conditionDecayMult ?? 1.0;
        plane.condition = Math.max(0, plane.condition - 0.001 * decayMult);
        // Reputation drip from equipped livery/interior upgrades. A bare
        // plane adds nothing; a gold-trim + business-cabin + AVOD plane
        // gradually buys back rep on every successful arrival.
        const repBump = planeReputationPerFlight(plane.upgrades);
        if (repBump > 0) {
          player.reputation = Math.min(100, player.reputation + repBump);
        }
        plane.status = { kind: 'idle', airportId: arrivedAt };
        lastLandedAt[plane.id] = now;
        if (!player.isAI) {
          const sign = result.profit >= 0 ? '+' : '';
          state.pushNews(
            `${plane.name} arrived in ${arrivedAt.toUpperCase()} — ${result.passengers} pax, ${sign}$${Math.round(result.profit).toLocaleString('en-US')}.`
          );
          sound.play('land');
        }
        // Post-landing mishap check. A neglected plane (condition < 0.5)
        // rolls for an incident; the lower the condition, the higher the
        // chance and the worse the outcome. Crashes destroy the plane;
        // incidents force an immediate emergency repair + reputation hit.
        // Player.id is passed so AI rivals' planes can crash too — only
        // human gets a news headline.
        maybeMishap(player, plane, result.passengers);
      } else if (status.kind === 'ferry') {
        if (now < status.arrivesAt) continue;
        const arrivedAt = status.to;
        // Half the per-flight wear of a revenue flight — no pax cycles.
        // CEO decay perk applies here too.
        const decayMult = getCEO(player.ceoId)?.perks.conditionDecayMult ?? 1.0;
        plane.condition = Math.max(0, plane.condition - 0.0005 * decayMult);
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

/** Release planes whose maintenance window has elapsed. Maintenance status
 *  is set by Sabotage (incendiary / super-glue) — when doneAt is reached
 *  the plane returns to idle at the same airport so it can dispatch again. */
export function releaseMaintenancePlanes() {
  const state = GameState.get();
  const now = dateToMinutes(state.date);
  for (const player of state.players) {
    for (const plane of player.planes) {
      if (plane.status.kind !== 'maintenance') continue;
      if (now < plane.status.doneAt) continue;
      const airportId = plane.status.airportId;
      plane.status = { kind: 'idle', airportId };
      if (!player.isAI) {
        state.pushNews(`${plane.name} returned to service at ${getCity(airportId).name}.`);
      }
    }
  }
}

export function registerFlightHooks() {
  clock.onTick(() => {
    landArrivedPlanes();
    releaseMaintenancePlanes();
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
    const repairMult = getCEO(me.ceoId)?.perks.repairCostMult ?? 1.0;
    for (const plane of me.planes) {
      if (plane.status.kind !== 'idle') continue;
      if (plane.condition >= threshold) continue;
      const cost = Math.round((1 - plane.condition) * plane.model.price * 0.02 * repairMult);
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
