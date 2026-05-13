import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { Plane } from '../state/Plane';
import { Route } from '../state/Route';
import { CITIES, distanceKm, getCity, PLANE_MODELS, getPlaneModel } from '../state/catalog';
import { suggestedTicketPrice, getFuelPrice } from './Economy';
import { buyShares, sellShares, fundamentalValue, getFloat } from './Stocks';
import { getDifficulty } from '../state/Difficulty';
import { getCEO } from '../state/ceos';
import { clock } from './Clock';
import { acceptContract, dispatchCargo } from './Cargo';

/**
 * Daily AI turn — each rival follows the same constraints the human does
 * (crew hires cost cash, repairs cost cash, mishaps happen, etc.) but
 * automates the decisions. Beyond the basic "buy a plane, open a route"
 * loop, AI now:
 *   - Repairs neglected planes on the same Workshop cost formula the
 *     human pays, gated by their CEO's repairCostMult perk.
 *   - Opens new routes by undercutting any existing rival on the same
 *     city pair (and rebalances existing-route prices when undercut).
 *   - Picks expansion targets that bias toward high-demand low-rival
 *     pairs, so the strongest rival pursues the same opportunities a
 *     smart human would.
 */
export function aiDailyTurn() {
  const state = GameState.get();
  for (const player of state.players) {
    if (!player.isAI) continue;
    if (state.takenOverBy[player.id]) continue; // eliminated rivals don't act
    // Hire crew if needed before buying more planes. Same hire cost as
    // the human pays in Personnel — kept locally as a constant so this
    // file doesn't need to depend on the Personnel module.
    while (player.pilots < player.planes.length + 1 && player.cash > 50_000) {
      player.cash -= 8_000;
      player.pilots += 1;
    }
    while (player.mechanics < player.planes.length + 1 && player.cash > 50_000) {
      player.cash -= 4_000;
      player.mechanics += 1;
    }

    // Workshop repair on the same cost formula the human auto-repair uses.
    // Threshold is more conservative than the human default (40% vs 50%) so
    // the AI doesn't spend its entire cash pile on continuous touch-ups.
    aiRepairFleet(player);

    const cfg = getDifficulty(state.difficulty);
    const aiHome = player.hubs[0];
    // Try to buy a plane if affordable and fleet under cap. Parked at the
    // airline's own home, not the global HOME_AIRPORT.
    if (player.planes.length < 5 && Math.random() < cfg.aiBuyChance) {
      const affordable = PLANE_MODELS.filter(m => m.price * 1.1 <= player.cash);
      if (affordable.length > 0) {
        const choice = affordable[Math.floor(Math.random() * affordable.length)];
        const plane = new Plane(choice.id, aiHome);
        player.planes.push(plane);
        player.cash -= choice.price;
      }
    }

    // Defensive repricing — if anyone has undercut us on an existing route
    // since the last turn, drop our ticket toward theirs. Limited to a
    // single $5 step per day so prices don't death-spiral overnight.
    aiRebalancePrices(player);

    // Open a new route from the airline's own home for any idle, unassigned
    // plane parked there. Picks the highest-demand low-competition pair.
    aiOpenRoute(player);

    // Stock-buying behavior: consider buying shares of vulnerable rivals
    // (or the human if they look weak). Spend up to 8% of cash per turn on
    // value buys, or aggressive on a clear takeover target.
    aiTradeStocks(player);

    // Cargo competition: with idle planes, grab profitable contracts off
    // the same shared board the human shops from.
    aiBidCargo(player);
  }
}

/** Same auto-repair logic the human's Settings toggle gives them — gated
 *  by the AI's CEO repair-discount perk and capped by available cash. */
function aiRepairFleet(player: Player) {
  const repairMult = getCEO(player.ceoId)?.perks.repairCostMult ?? 1.0;
  const threshold = 0.4; // more conservative than human's max 50% — saves cash
  for (const plane of player.planes) {
    if (plane.status.kind !== 'idle') continue;
    if (plane.condition >= threshold) continue;
    const cost = Math.round((1 - plane.condition) * plane.model.price * 0.01 * repairMult);
    if (player.cash < cost) continue;
    player.cash -= cost;
    plane.condition = 1.0;
  }
}

/** Drop each route's ticket price toward the cheapest rival on the same
 *  city pair, one $5 step per day. Floor at 60% of fair price so a price
 *  war can't crater margins below sustainability. */
function aiRebalancePrices(player: Player) {
  const state = GameState.get();
  for (const route of player.routes) {
    const a = getCity(route.fromCity);
    const b = getCity(route.toCity);
    const fair = suggestedTicketPrice(route.distanceKm, a.demand, b.demand);
    const floor = Math.max(50, Math.round(fair * 0.6 / 5) * 5);

    // Cheapest other-airline route on the same pair.
    let cheapest: number | null = null;
    for (const other of state.players) {
      if (other.id === player.id) continue;
      for (const r of other.routes) {
        const samePair =
          (r.fromCity === route.fromCity && r.toCity === route.toCity) ||
          (r.fromCity === route.toCity && r.toCity === route.fromCity);
        if (!samePair) continue;
        if (cheapest === null || r.ticketPrice < cheapest) cheapest = r.ticketPrice;
      }
    }
    if (cheapest === null) continue;

    // If we're already at or below the rival, leave it.
    if (route.ticketPrice <= cheapest) continue;
    // Step one tick down toward cheapest, respecting the floor.
    const next = Math.max(floor, route.ticketPrice - 5);
    if (next < route.ticketPrice) route.ticketPrice = next;
  }
}

/** Pick the next expansion target for an unassigned idle plane at the
 *  AI's home hub. Score = city demand minus a competition penalty for
 *  each existing rival route on the pair. Initial price undercuts any
 *  existing rival by $5 (with the same 60%-of-fair floor as repricing). */
function aiOpenRoute(player: Player) {
  const state = GameState.get();
  const aiHome = player.hubs[0];
  const unassigned = player.planes.find(p =>
    !p.routeId
    && p.status.kind === 'idle'
    && p.status.airportId === aiHome
  );
  if (!unassigned) return;

  const here = getCity(aiHome);
  const reachable = CITIES.filter(c =>
    c.id !== aiHome && distanceKm(here, c) <= getPlaneModel(unassigned.modelId).range
  );
  if (reachable.length === 0) return;

  // Exclude pairs we already operate.
  const fresh = reachable.filter(c => !player.routes.some(r =>
    (r.fromCity === aiHome && r.toCity === c.id)
    || (r.fromCity === c.id && r.toCity === aiHome)
  ));
  const pool = fresh.length > 0 ? fresh : reachable;

  // Score by demand minus rival count on this pair. The strongest AI now
  // bunches into the same fat-demand pairs a human would target.
  let best = pool[0];
  let bestScore = -Infinity;
  for (const c of pool) {
    let rivals = 0;
    for (const p of state.players) {
      for (const r of p.routes) {
        if ((r.fromCity === aiHome && r.toCity === c.id)
            || (r.fromCity === c.id && r.toCity === aiHome)) rivals++;
      }
    }
    const score = c.demand * 10 - rivals * 3 + Math.random() * 0.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  const dest = best;
  const dist = distanceKm(here, dest);
  const fair = suggestedTicketPrice(dist, here.demand, dest.demand);
  const floor = Math.max(50, Math.round(fair * 0.6 / 5) * 5);

  // Undercut the cheapest existing route on the pair by one $5 step.
  let cheapest: number | null = null;
  for (const p of state.players) {
    for (const r of p.routes) {
      const samePair =
        (r.fromCity === aiHome && r.toCity === dest.id)
        || (r.fromCity === dest.id && r.toCity === aiHome);
      if (samePair && (cheapest === null || r.ticketPrice < cheapest)) {
        cheapest = r.ticketPrice;
      }
    }
  }
  const startPrice = cheapest === null
    ? Math.round(fair / 5) * 5
    : Math.max(floor, Math.round((cheapest - 5) / 5) * 5);

  const route = new Route(player.id, here.id, dest.id, dist, startPrice);
  player.routes.push(route);
  unassigned.routeId = route.id;
}

function aiTradeStocks(player: Player) {
  const state = GameState.get();

  // ---- Sell pass: rebalance holdings ---------------------------------
  // Sell when (a) holdings are overvalued vs fundamental, OR (b) cash
  // is critically low — but NEVER abandon a takeover path (ownedFrac
  // already past 30% of a target's float).
  for (const targetId of Object.keys(player.holdings)) {
    const owned = player.holdings[targetId] ?? 0;
    if (owned <= 0) continue;
    const target = state.findPlayer(targetId);
    if (!target) continue;
    if (state.takenOverBy[targetId]) continue;
    const price = state.stockPrices[targetId] ?? 0;
    if (price <= 0) continue;
    const fund = fundamentalValue(target);
    const ownedFrac = owned / getFloat(targetId);

    // Don't sell shares of a target we're actively trying to take over.
    if (ownedFrac > 0.3) continue;

    const overvalued = price > fund * 1.25;
    const cashStrapped = player.cash < 500_000;
    if (!overvalued && !cashStrapped) continue;

    // Sell up to 25% of holdings at a time, capped at 25K shares per day
    // so the AI doesn't crater a price by dumping a million shares.
    const sellN = Math.min(owned, Math.max(Math.floor(owned * 0.25), cashStrapped ? owned : 0), 25_000);
    if (sellN < 100) continue;
    sellShares(player, targetId, sellN);
  }

  // ---- Buy pass: existing value-hunting logic -------------------------
  if (player.cash < 1_000_000) return; // need a war chest

  // Candidate targets: any other player who isn't already taken over.
  const targets = state.players.filter(p => p.id !== player.id && !state.takenOverBy[p.id]);
  if (targets.length === 0) return;

  // Score each: low rep + price below fundamental + already partial ownership = juicy.
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const t of targets) {
    const price = state.stockPrices[t.id] ?? 50;
    const fund = fundamentalValue(t);
    const ownedFrac = (player.holdings[t.id] ?? 0) / getFloat(t.id);
    if (price <= 0) continue;
    const undervalue = (fund - price) / Math.max(price, 1);
    const vulnerable = (60 - t.reputation) / 60;
    const momentum = ownedFrac < 0.5 ? ownedFrac * 1.5 : 0;
    // Annualized dividend yield boost — 4 payments/year × per-share / price.
    const divYield = price > 0 ? (t.dividendPerShare * 4) / price : 0;
    const score = undervalue * 0.6 + vulnerable * 0.4 + momentum + divYield * 0.8;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (!best) return;

  const price = state.stockPrices[best.id] ?? 50;
  const ownedFrac = (player.holdings[best.id] ?? 0) / getFloat(best.id);
  const cfg = getDifficulty(state.difficulty);
  // Aggressive if close to majority; otherwise modest. Difficulty scales budget.
  const cashBudget = (ownedFrac > 0.3 ? player.cash * 0.25 : player.cash * 0.05) * cfg.aiStockBudgetMult;
  const sharesToBuy = Math.floor(cashBudget / price);
  if (sharesToBuy < 100) return;
  const stepped = Math.min(sharesToBuy, 50_000);
  buyShares(player, best.id, stepped);
}

/**
 * Look at the shared cargo board and pick contracts whose net-of-fuel
 * profit clears a sane margin. Limited to two accept-and-dispatch
 * actions per day so the AI doesn't sweep the entire board in one tick.
 *
 * Only matches contracts the AI can fly RIGHT NOW with an idle plane —
 * skips anything requiring an unaffordable freighter purchase. The dispatch
 * path already handles range / capacity gating; this just makes the AI a
 * realistic competitor for the same pool of contracts the human shops.
 */
function aiBidCargo(player: Player) {
  const state = GameState.get();
  const fuel = getFuelPrice();
  let accepted = 0;
  const MAX_PER_DAY = 2;

  for (const contract of [...state.cargoOffers]) {
    if (accepted >= MAX_PER_DAY) break;
    if (contract.status !== 'available') continue;

    const from = getCity(contract.fromCity);
    const to = getCity(contract.toCity);
    const dist = distanceKm(from, to);

    // Find an idle plane that can carry the load AND has the range.
    // Prefer the most fuel-efficient match — best $/contract.
    const eligible = player.planes.filter(p => {
      if (p.status.kind !== 'idle') return false;
      const m = getPlaneModel(p.modelId);
      return m.cargoCapacityKg >= contract.weightKg && m.range >= dist;
    }).sort((a, b) => getPlaneModel(a.modelId).fuelPerKm - getPlaneModel(b.modelId).fuelPerKm);

    if (eligible.length === 0) continue;
    const plane = eligible[0];
    const here = getCity(plane.status.kind === 'idle' ? plane.status.airportId : player.hubs[0]);
    const totalDist = distanceKm(here, from) + dist;
    const fuelCost = totalDist * getPlaneModel(plane.modelId).fuelPerKm * fuel;
    // Demand at least 35% margin after fuel — covers wear + opportunity cost.
    if (contract.payment - fuelCost < contract.payment * 0.35) continue;
    if (player.cash < fuelCost) continue;

    if (!acceptContract(player, contract.id)) continue;
    const result = dispatchCargo(player, contract.id, plane.id);
    if (result.ok) {
      accepted++;
    }
  }
}

export function registerAIHooks() {
  clock.onDay(() => aiDailyTurn());
}
