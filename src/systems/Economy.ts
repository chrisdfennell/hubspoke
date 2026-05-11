import { GameState, CURRENT_BALANCE_VERSION } from '../state/GameState';
import { Plane } from '../state/Plane';
import { Route } from '../state/Route';
import { getCity, getPlaneModel, DEFAULT_AIRLINES, HOME_AIRPORT } from '../state/catalog';
import { getDemandMult } from '../state/demandModifiers';
import { planeLoadFactorBonus } from '../state/upgrades';
import { clock } from './Clock';

/** Fuel price in $ per liter (drifts day to day, mean-reverting to FUEL_BASELINE). */
export let fuelPrice = 0.80;

/** Hard floor and ceiling for fuel price. Tight bounds so a long-running save
 *  can't slide into ruinous territory via random walk. */
const FUEL_PRICE_MIN = 0.55;
const FUEL_PRICE_MAX = 1.10;
/** Mean fuelPrice reverts toward each day. */
const FUEL_BASELINE = 0.80;

function clampFuel(p: number): number {
  return Math.max(FUEL_PRICE_MIN, Math.min(FUEL_PRICE_MAX, p));
}

export function setFuelPrice(p: number) {
  // Clamp on assignment so loaded saves with out-of-range values self-heal.
  fuelPrice = clampFuel(p);
}

export function getFuelPrice(): number {
  return fuelPrice;
}

export function suggestedTicketPrice(distanceKm: number, demandFrom: number, demandTo: number): number {
  // Yield model: a $30 base fare (taxes / boarding / terminal use) plus
  // $0.12/km, scaled by average city demand. Rounded to nearest $5, with a
  // $40 floor so very short hops still cover ground handling.
  const avgDemand = (demandFrom + demandTo) / 2;
  const adj = (30 + distanceKm * 0.12) * avgDemand;
  return Math.max(40, Math.round(adj / 5) * 5);
}

/** How many minutes a flight takes given plane speed and distance. */
export function flightMinutes(plane: Plane, distanceKm: number): number {
  const m = plane.model;
  return Math.round((distanceKm / m.speed) * 60);
}

/** Total fuel cost for a one-way flight. */
export function fuelCost(plane: Plane, distanceKm: number): number {
  return distanceKm * plane.model.fuelPerKm * fuelPrice;
}

/** Find all routes (across airlines) that serve the same city pair. */
export function competingRoutes(route: Route): Route[] {
  const state = GameState.get();
  const out: Route[] = [];
  for (const p of state.players) {
    for (const r of p.routes) {
      if (r.id === route.id) continue;
      const samePair =
        (r.fromCity === route.fromCity && r.toCity === route.toCity) ||
        (r.fromCity === route.toCity   && r.toCity === route.fromCity);
      if (samePair) out.push(r);
    }
  }
  return out;
}

/** Expected load factor 0..1 for a route, accounting for price vs. demand,
 *  daily demand-modifying events, and rival competition on the same city pair. */
export function expectedLoadFactor(route: Route): number {
  const state = GameState.get();
  const a = getCity(route.fromCity);
  const b = getCity(route.toCity);
  const fairPrice = suggestedTicketPrice(route.distanceKm, a.demand, b.demand);
  const ratio = route.ticketPrice / fairPrice;

  // Base monopoly load factor: linear price elasticity, peaking at ~0.90 when
  // the player charges the suggested fair fare.
  let lf = 1.20 - 0.30 * ratio;

  // Daily demand modifier from events (hurricane, tourism boom, etc.).
  const demandMod = (getDemandMult(a.id, state.date) + getDemandMult(b.id, state.date)) / 2;
  lf *= demandMod;

  // Competition: split monopoly demand by inverse-price weight, softened by
  // raising the share to a < 1 power. Strict 1/N is too brutal once 3+ carriers
  // crowd a small-island hub. Power 0.4 means: 1 equal rival → 0.76x,
  // 3 equal rivals → 0.57x.
  //
  // The human's "wait for plane to fill" threshold throttles how much weight
  // their OTHER routes carry from a rival's perspective: a player who waits
  // for high LF is dispatching less often, so they're a smaller competitor
  // for rivals on the same pair. The route in the spotlight always uses full
  // weight (it's the one being evaluated for a flight right now).
  const rivals = competingRoutes(route);
  if (rivals.length > 0) {
    const humanId = state.human.id;
    const humanThreshold = state.settings.minLoadFactorForTakeoff;
    const weightOf = (r: Route): number => {
      const base = 1 / Math.max(1, r.ticketPrice);
      if (r === route) return base;
      if (r.ownerId !== humanId) return base;
      if (humanThreshold <= 0) return base;
      return base * Math.max(0.1, 1 - humanThreshold);
    };
    const all = [route, ...rivals];
    const totalWeight = all.reduce((s, r) => s + weightOf(r), 0);
    const myShare = weightOf(route) / totalWeight;
    lf *= Math.pow(myShare, 0.4);
  }

  return Math.max(0.02, Math.min(0.95, lf));
}

/** Revenue minus fuel and per-flight ops for one one-way flight. */
export function flightProfit(plane: Plane, route: Route): { revenue: number; fuel: number; ops: number; profit: number; passengers: number } {
  let lf = expectedLoadFactor(route);
  // The human's "wait for plane to fill" threshold acts as a floor on the
  // load factor of dispatched flights. The dispatcher already gates takeoffs
  // below the threshold; when a flight DOES go, simulate that the plane has
  // been waiting and accumulated enough pax to hit at least the threshold.
  const state = GameState.get();
  if (route.ownerId === state.human.id) {
    const threshold = state.settings.minLoadFactorForTakeoff;
    if (threshold > 0 && lf < threshold) lf = threshold;
  }
  // Per-plane interior + entertainment upgrades multiply the effective load
  // factor — full business cabin + streaming suite + WiFi stacks to roughly
  // +20%. Capped at 1.0 so we never exceed seat count.
  lf = Math.min(1, lf * planeLoadFactorBonus(plane.upgrades));
  const passengers = Math.floor(plane.model.seats * lf);
  const revenue = passengers * route.ticketPrice;
  const fuel = fuelCost(plane, route.distanceKm);
  // Per-flight ops: gate fees, ground handling, catering, cleaning. Scales
  // with passengers carried (catering/cleaning) plus a fixed turn cost and a
  // small share of revenue. Tuned to leave headroom on competed Hawaii hops
  // where a Cessna may pull only 4-6 pax against 3+ rivals.
  const ops = 50 + passengers * 4 + Math.round(revenue * 0.015);
  const profit = revenue - fuel - ops;
  return { revenue, fuel, ops, profit, passengers };
}

/**
 * Lazy one-shot migrator for legacy save data. Each version bumps a separate
 * step. Idempotent — runs once per save (gated by `state.balanceVersion`).
 *
 *  v1 — Bumps any route still priced well below the current fair fare up to
 *       fair, so flights opened under the old `$0.10/km, $20 floor` formula
 *       become viable under the rebalanced model. Threshold: 70% of fair.
 *  v2 — Resets each AI to its catalog-defined home airport, relocates the
 *       AI's idle planes there, and clears stale routes so the AI rebuilds
 *       its network from the right hub. Fixes saves that predate the AI-hub
 *       distribution (everyone was at HNL by default).
 */
export function migrateBalance(): boolean {
  const state = GameState.get();
  const from = state.balanceVersion ?? 0;
  if (from >= CURRENT_BALANCE_VERSION) return false;

  // ----- v1: route ticket prices -----
  if (from < 1) {
    let bumped = 0;
    for (const player of state.players) {
      for (const route of player.routes) {
        const a = getCity(route.fromCity);
        const b = getCity(route.toCity);
        const fair = suggestedTicketPrice(route.distanceKm, a.demand, b.demand);
        if (route.ticketPrice < fair * 0.7) {
          route.ticketPrice = fair;
          bumped++;
        }
      }
    }
    if (bumped > 0) {
      state.pushNews(`Pricing rebalance: ${bumped} route fare${bumped === 1 ? '' : 's'} updated to suggested fair price.`);
    }
  }

  // ----- v2: AI hub redistribution -----
  if (from < 2) {
    let moved = 0;
    for (const player of state.players) {
      if (!player.isAI) continue;
      const def = DEFAULT_AIRLINES.find(a => a.id === player.id);
      if (!def) continue;
      // Only correct AIs that look like they're sitting on the legacy default.
      const looksLegacy = player.hubs.length === 1 && player.hubs[0] === HOME_AIRPORT;
      if (!looksLegacy || def.home === HOME_AIRPORT) continue;

      player.hubs = [def.home];
      // Relocate idle planes; flying ones will land where they're heading and
      // become idle (and then sit unused at the wrong airport — acceptable).
      for (const plane of player.planes) {
        if (plane.status.kind === 'idle') {
          plane.status = { kind: 'idle', airportId: def.home };
        }
      }
      // Drop stale routes that originated at HNL — AI will reopen routes
      // from the correct home on its next daily turn.
      for (const plane of player.planes) plane.routeId = null;
      player.routes = [];
      moved++;
    }
    if (moved > 0) {
      state.pushNews(`Rivals relocated: ${moved} airline${moved === 1 ? '' : 's'} moved to their proper home hubs.`);
    }
  }

  state.balanceVersion = CURRENT_BALANCE_VERSION;
  return true;
}

/** Hook called once per game day to deduct maintenance and decay condition. */
export function dailyMaintenance() {
  const state = GameState.get();
  for (const player of state.players) {
    let total = 0;
    for (const plane of player.planes) {
      const m = getPlaneModel(plane.modelId);
      total += m.maintenancePerHour * 24;
      // Idle decay is much smaller than per-flight wear — covers ramp/weather
      // exposure on the apron, not engine cycles.
      plane.condition = Math.max(0.0, plane.condition - 0.0003);
    }
    if (total > 0) player.cash -= total;
  }
}

/** Drift fuel price slightly each day, with mean-reversion toward FUEL_BASELINE
 *  so a long-running save doesn't random-walk into the ceiling and stay there. */
export function driftFuelPrice() {
  const noise = (Math.random() - 0.5) * 0.02;        // ±$0.01/day random walk
  const reversion = (FUEL_BASELINE - fuelPrice) * 0.04; // pulls 4% toward baseline daily
  fuelPrice = clampFuel(fuelPrice + noise + reversion);
}

export function registerEconomyHooks() {
  clock.onDay((_state) => {
    driftFuelPrice();
    dailyMaintenance();
  });
}
