import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { Plane } from '../state/Plane';
import { Route } from '../state/Route';
import { CITIES, distanceKm, getCity, PLANE_MODELS, getPlaneModel } from '../state/catalog';
import { suggestedTicketPrice } from './Economy';
import { buyShares, fundamentalValue, FLOAT } from './Stocks';
import { getDifficulty } from '../state/Difficulty';
import { getCEO } from '../state/ceos';
import { clock } from './Clock';

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
    const cost = Math.round((1 - plane.condition) * plane.model.price * 0.02 * repairMult);
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
    const ownedFrac = (player.holdings[t.id] ?? 0) / FLOAT;
    if (price <= 0) continue;
    const undervalue = (fund - price) / Math.max(price, 1);
    const vulnerable = (60 - t.reputation) / 60;
    const momentum = ownedFrac < 0.5 ? ownedFrac * 1.5 : 0;
    const score = undervalue * 0.6 + vulnerable * 0.4 + momentum;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (!best) return;

  const price = state.stockPrices[best.id] ?? 50;
  const ownedFrac = (player.holdings[best.id] ?? 0) / FLOAT;
  const cfg = getDifficulty(state.difficulty);
  // Aggressive if close to majority; otherwise modest. Difficulty scales budget.
  const cashBudget = (ownedFrac > 0.3 ? player.cash * 0.25 : player.cash * 0.05) * cfg.aiStockBudgetMult;
  const sharesToBuy = Math.floor(cashBudget / price);
  if (sharesToBuy < 100) return;
  const stepped = Math.min(sharesToBuy, 50_000);
  buyShares(player, best.id, stepped);
}

export function registerAIHooks() {
  clock.onDay(() => aiDailyTurn());
}
