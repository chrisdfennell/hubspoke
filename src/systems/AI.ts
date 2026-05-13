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
import { buyUsedPlane } from './UsedMarket';
import { hubCost } from '../state/Player';
import { UPGRADES } from '../state/upgrades';
import { ITEMS, applyBoostEffect } from '../state/items';
import { dateToDay } from '../state/demandModifiers';
import { crewUtilization } from './Personnel';
import { setDividend } from './Stocks';
import { sellPlane } from './UsedMarket';

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
    // Crew management — staffing AND morale-aware extra hiring so a
    // strained AI doesn't just sit on dropping morale.
    aiManageCrew(player);

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

    // Used-plane sniping: cheaper than buying new when a good listing
    // shows up. Rolls at half the aiBuyChance rate so the AI doesn't
    // sweep the market clean every day on higher difficulties.
    aiShopUsed(player);

    // Hub expansion — once an AI has 3+ planes and a healthy cash buffer
    // it considers opening a new hub at a high-demand city it doesn't
    // already operate from.
    aiExpandHubs(player);

    // Outfit planes: interior + entertainment upgrades buy meaningful
    // load-factor bumps and were a player-only advantage until now.
    aiBuyUpgrades(player);

    // Duty Free boosts on cooldown — marketing/press-spin for rep,
    // pilot-training when the fleet is worn down. Same per-day cooldown
    // the human respects in the Duty Free room.
    aiUseBoosts(player);

    // Dividend declaration — cash-rich, well-regarded AIs return capital
    // to shareholders (which can include the human if they bought shares).
    aiManageDividends(player);

    // Fleet pruning — sell idle planes the AI can't afford to repair
    // back to itself, or surplus planes that aren't earning. The plane
    // lands on the same used market the human shops.
    aiManageFleet(player);
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
  const cfg = getDifficulty(state.difficulty);

  // ---- Sell pass: rebalance holdings ---------------------------------
  // Sell when (a) holdings are overvalued vs fundamental, OR (b) cash
  // is critically low — but NEVER abandon a takeover path (ownedFrac
  // already past 30% of a target's float). Difficulty scales the
  // overvalue threshold: Easy AIs trim positions at 1.15× (eager
  // sellers, low takeover threat), Brutal AIs hoard until 1.50×.
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

    const overvalued = price > fund * cfg.aiSellOvervalueThreshold;
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
  // Aggressive if close to majority; otherwise modest. Difficulty scales budget.
  const cashBudget = (ownedFrac > 0.3 ? player.cash * 0.25 : player.cash * 0.05) * cfg.aiStockBudgetMult;
  const sharesToBuy = Math.floor(cashBudget / price);
  if (sharesToBuy < 100) return;
  const stepped = Math.min(sharesToBuy, 50_000);
  buyShares(player, best.id, stepped);
}

/**
 * Roll for a used-plane buy. Probability scales with difficulty
 * (`aiBuyChance × 0.5` so even Brutal AIs leave most listings for the
 * human). Scores affordable listings by `(capacity × condition) / ask`
 * — passenger capacity for revenue planes, cargo capacity for
 * freighters — and snaps up the best fit. Respects the fleet-size
 * cap (5) the new-plane buy logic already uses.
 */
function aiShopUsed(player: Player) {
  const state = GameState.get();
  const cfg = getDifficulty(state.difficulty);
  if (player.planes.length >= 5) return;
  if (state.usedPlanes.length === 0) return;
  if (Math.random() >= cfg.aiBuyChance * 0.5) return;

  // Need a 10% liquidity buffer over the ask so we don't drain the
  // bank account dry on the purchase and have nothing for repair/fuel.
  const affordable = state.usedPlanes.filter(l => l.askPrice * 1.1 <= player.cash);
  if (affordable.length === 0) return;

  let best = affordable[0];
  let bestScore = -Infinity;
  for (const l of affordable) {
    const model = getPlaneModel(l.modelId);
    // Score by capacity-per-dollar. Freighters (seats=0) fall back to
    // cargo capacity so the 747F isn't penalized against passenger metal.
    const capacity = model.seats > 0 ? model.seats : model.cargoCapacityKg / 100;
    const score = (capacity * l.condition) / l.askPrice;
    if (score > bestScore) { bestScore = score; best = l; }
  }

  const result = buyUsedPlane(player, best.id, player.hubs[0]);
  if (result.ok) {
    const model = getPlaneModel(best.modelId);
    state.pushNews(`${player.name} bought a used ${model.name} off the market for ${formatBriefMoney(best.askPrice)}.`);
  }
}

/** Brief $ formatter used by AI news lines — keeps headlines compact. */
function formatBriefMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
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
  const cfg = getDifficulty(state.difficulty);
  const fuel = getFuelPrice();
  let accepted = 0;

  for (const contract of [...state.cargoOffers]) {
    if (accepted >= cfg.aiCargoMaxPerDay) break;
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
    // Difficulty gates the minimum margin — Easy AIs hold out for fat
    // contracts; Brutal AIs sweep anything that clears 15%.
    if (contract.payment - fuelCost < contract.payment * cfg.aiCargoMinMargin) continue;
    if (player.cash < fuelCost) continue;

    if (!acceptContract(player, contract.id)) continue;
    const result = dispatchCargo(player, contract.id, plane.id);
    if (result.ok) {
      accepted++;
    }
  }
}

/**
 * Buy a new hub at a high-demand city. Requires fleet ≥3 planes AND
 * cash ≥ 3× the cheapest reachable hub cost (so the AI doesn't drain
 * the bank on a hub it can't immediately use). Skips cities already in
 * the AI's hub list. Rolls at half `aiBuyChance` so expansion stays
 * occasional rather than every-day.
 */
function aiExpandHubs(player: Player) {
  const state = GameState.get();
  const cfg = getDifficulty(state.difficulty);
  if (player.planes.length < 3) return;
  // Cap at 3 hubs per AI so they don't sprawl into every city on the map.
  if (player.hubs.length >= 3) return;
  if (Math.random() >= cfg.aiBuyChance * 0.5) return;

  // Candidate cities: not already a hub, and the AI can afford it with
  // a 2× cash buffer afterward for crew + a plane.
  const candidates = CITIES.filter(c => {
    if (player.hubs.includes(c.id)) return false;
    return player.cash >= hubCost(c) * 3;
  });
  if (candidates.length === 0) return;

  // Score by demand minus rival-already-here penalty so the AI picks
  // fat markets that aren't already crowded with hubs.
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    let rivalHubs = 0;
    for (const p of state.players) {
      if (p.id === player.id) continue;
      if (p.hubs.includes(c.id)) rivalHubs++;
    }
    const score = c.demand * 10 - rivalHubs * 4 + Math.random() * 0.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }

  player.cash -= hubCost(best);
  player.hubs.push(best.id);
  state.pushNews(`${player.name} opened a new hub at ${best.name}.`);
}

/**
 * Buy one upgrade per turn for the AI's most-capable unoutfitted plane.
 * Prefers interior (biggest LF multiplier) over entertainment, skips
 * livery entirely (cosmetic — AI doesn't care about tail-fin colors).
 *
 * Sizes the upgrade tier to the plane class: turboprops get cheap
 * entries, narrowbodies get mid-tier, widebodies get top-tier. Avoids
 * the absurd "$1.2M lie-flat suites on a Cessna" outcome.
 */
function aiBuyUpgrades(player: Player) {
  const state = GameState.get();
  const cfg = getDifficulty(state.difficulty);
  // Modest daily roll — even Brutal AIs upgrade ~1/3 of days, not every day.
  if (Math.random() >= cfg.aiBuyChance * 0.4) return;

  // Tier ceiling by plane class: Cessna shouldn't equip lie-flat suites.
  const maxPriceByClass: Record<string, number> = {
    turboprop:  200_000,
    narrowbody: 600_000,
    widebody:  1_500_000,
  };

  for (const plane of player.planes) {
    const model = getPlaneModel(plane.modelId);
    if (model.seats === 0) continue; // freighters skip pax upgrades
    const ceiling = maxPriceByClass[model.cls] ?? 200_000;

    // Try interior first (biggest LF bump), then entertainment.
    for (const cat of ['interior', 'entertainment'] as const) {
      if (plane.upgrades[cat]) continue;
      // Best affordable upgrade in this category for this plane's tier.
      const candidates = UPGRADES.filter(u =>
        u.category === cat &&
        u.price <= ceiling &&
        u.price <= player.cash
      ).sort((a, b) => (b.loadFactorBonus ?? 0) - (a.loadFactorBonus ?? 0));
      if (candidates.length === 0) continue;
      const u = candidates[0];
      player.cash -= u.price;
      plane.upgrades[cat] = u.id;
      return; // one upgrade per daily turn — keeps spend gradual
    }
  }
}

/**
 * Use a Duty Free boost when it would matter. Marketing / Press Spin
 * fire when reputation < 70; Pilot Training Course fires when the fleet
 * average condition < 0.6. Respects the per-item one-per-day cooldown
 * via `player.boostUsedOn` so the AI can't stack two boosts on the
 * same day any more than the human can.
 */
function aiUseBoosts(player: Player) {
  const state = GameState.get();
  const today = dateToDay(state.date);

  // Helper to check + apply + stamp cooldown atomically.
  const tryBoost = (itemId: string): boolean => {
    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return false;
    if ((player.boostUsedOn[itemId] ?? -1) === today) return false;
    if (player.cash < item.price) return false;
    player.cash -= item.price;
    applyBoostEffect(player, itemId);
    player.boostUsedOn[itemId] = today;
    return true;
  };

  // Reputation rescue: a low-rep AI loses passengers AND becomes a takeover
  // target, so the cheap Press Spin pays for itself fast.
  if (player.reputation < 70) {
    if (tryBoost('press-spin')) return;
    if (tryBoost('marketing')) return;
  }

  // Fleet-wide refit: when several planes are tired, a single Pilot Training
  // Course refit is cheaper than hand-repairing every airframe.
  if (player.planes.length > 0) {
    const avgCondition = player.planes.reduce((sum, p) => sum + p.condition, 0) / player.planes.length;
    if (avgCondition < 0.6) {
      if (tryBoost('pilot-prog')) return;
    }
  }
}

/**
 * Crew sizing for the AI: cover the fleet plus a buffer that scales
 * with morale. Healthy crews keep the original +1 buffer. Strained
 * crews (morale<50) target +2 to reduce utilization; burned-out crews
 * (<30) target +3 since one resignation is one too many. Reuses the
 * same hire cost the human pays in Personnel so the AI isn't cheating.
 */
function aiManageCrew(player: Player) {
  const PILOT_COST = 8_000;
  const MECH_COST = 4_000;
  let buffer = 1;
  if (player.morale < 30) buffer = 3;
  else if (player.morale < 50) buffer = 2;
  // If currently overworked (utilization > 1), force at least +1 over
  // current headcount regardless of morale — catches the case where
  // morale hasn't dropped yet but the AI just bought a plane.
  const utilization = crewUtilization(player);
  const targetPilots = player.planes.length + buffer;
  const targetMechs  = player.planes.length + buffer;

  while (player.pilots < targetPilots && player.cash > 50_000) {
    player.cash -= PILOT_COST;
    player.pilots += 1;
  }
  while (player.mechanics < targetMechs && player.cash > 50_000) {
    player.cash -= MECH_COST;
    player.mechanics += 1;
  }
  // One extra hiring pulse if we're still overworked after the loop
  // (e.g., cash ran out partway). Pays for one of each if budget allows.
  if (utilization > 1.0 && player.cash > 60_000) {
    if (player.pilots < player.planes.length + buffer + 1) {
      player.cash -= PILOT_COST;
      player.pilots += 1;
    }
  }
}

/**
 * Cash-rich, well-regarded AIs declare a quarterly dividend so they
 * have something to attract buy-side interest with. Scales with cash
 * reserves: comfortable airlines pay a token dividend, flush ones pay
 * a proper one. Doesn't churn — once set, the dividend stays until
 * the AI's situation changes enough to trip a re-evaluation.
 */
function aiManageDividends(player: Player) {
  // Below these reputational + cash bars, no dividend — the airline
  // needs the cash for ops or can't justify the investor signal.
  if (player.reputation < 60) {
    if (player.dividendPerShare > 0) setDividend(player, 0);
    return;
  }
  if (player.cash < 50_000_000) {
    if (player.dividendPerShare > 0) setDividend(player, 0);
    return;
  }
  // Tier the dividend by cash reserves. Crossings are wide so the AI
  // doesn't flip-flop between tiers on a single bad day.
  let target = 0.10;
  if (player.cash > 500_000_000) target = 2.00;
  else if (player.cash > 300_000_000) target = 1.00;
  else if (player.cash > 100_000_000) target = 0.50;

  if (player.dividendPerShare !== target) {
    setDividend(player, target);
  }
}

/**
 * Sell off planes the AI can't justify keeping — idle, low-condition
 * planes the AI can't afford to repair to operating threshold. The
 * plane lands on the public used market with `ex-${airline}` source
 * label so the human can scoop it up. Rolls modestly each turn so
 * pruning is incremental, not a fire-sale.
 */
function aiManageFleet(player: Player) {
  // Only consider the AI's idle, route-less planes. Anything still
  // assigned to a route is presumed earning.
  const candidates = player.planes.filter(p =>
    p.status.kind === 'idle' && p.routeId === null,
  );
  if (candidates.length === 0) return;

  for (const plane of candidates) {
    const model = getPlaneModel(plane.modelId);
    const repairCost = (1 - plane.condition) * model.price * 0.01;
    // Two trigger paths to sell:
    //  1. Plane is in rough shape (<35% condition) AND AI doesn't have
    //     the cash to repair it back to operating threshold.
    //  2. Fleet is over the AI's effective cap (5) AND this plane is
    //     unassigned — rare since the buy loop respects the cap, but
    //     a takeover could push it over.
    const cantRepair = plane.condition < 0.35 && player.cash < repairCost * 1.5;
    const overCap = player.planes.length > 5;
    if (!cantRepair && !overCap) continue;

    // Modest daily roll so the AI doesn't liquidate its whole fleet on
    // one bad day — same dampening shape we use elsewhere for fleet
    // actions.
    if (Math.random() >= 0.35) continue;

    const result = sellPlane(player, plane.id);
    if (result.ok) {
      const state = GameState.get();
      state.pushNews(`${player.name} sold ${plane.name} (${model.name}) onto the used market.`);
      return; // one trade per day
    }
  }
}

export function registerAIHooks() {
  clock.onDay(() => aiDailyTurn());
}
