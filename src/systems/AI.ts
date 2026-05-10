import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { Plane } from '../state/Plane';
import { Route } from '../state/Route';
import { CITIES, distanceKm, getCity, PLANE_MODELS, getPlaneModel } from '../state/catalog';
import { suggestedTicketPrice } from './Economy';
import { buyShares, fundamentalValue, FLOAT } from './Stocks';
import { getDifficulty } from '../state/Difficulty';
import { clock } from './Clock';

/**
 * Simple AI: each rival, on a daily tick, considers buying a plane it can
 * afford and opening a route it can serve. Will be expanded later.
 */
export function aiDailyTurn() {
  const state = GameState.get();
  for (const player of state.players) {
    if (!player.isAI) continue;
    if (state.takenOverBy[player.id]) continue; // eliminated rivals don't act
    // Hire crew if needed before buying more planes.
    while (player.pilots < player.planes.length + 1 && player.cash > 50_000) {
      player.cash -= 8_000;
      player.pilots += 1;
    }
    while (player.mechanics < player.planes.length + 1 && player.cash > 50_000) {
      player.cash -= 4_000;
      player.mechanics += 1;
    }

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

    // Try to open a new route from the airline's own home for any idle,
    // unassigned plane parked there.
    const unassigned = player.planes.find(p =>
      !p.routeId
      && p.status.kind === 'idle'
      && p.status.airportId === aiHome
    );
    if (unassigned) {
      const here = getCity(aiHome);
      const reachable = CITIES.filter(c => c.id !== aiHome && distanceKm(here, c) <= getPlaneModel(unassigned.modelId).range);
      if (reachable.length > 0) {
        // Avoid opening a duplicate of an existing route on the same pair.
        const candidates = reachable.filter(c => !player.routes.some(r =>
          (r.fromCity === aiHome && r.toCity === c.id)
          || (r.fromCity === c.id && r.toCity === aiHome)
        ));
        const pool = candidates.length > 0 ? candidates : reachable;
        const dest = pool[Math.floor(Math.random() * pool.length)];
        const dist = distanceKm(here, dest);
        const price = suggestedTicketPrice(dist, here.demand, dest.demand);
        const route = new Route(player.id, here.id, dest.id, dist, price);
        player.routes.push(route);
        unassigned.routeId = route.id;
      }
    }

    // Stock-buying behavior: consider buying shares of vulnerable rivals
    // (or the human if they look weak). Spend up to 8% of cash per turn on
    // value buys, or aggressive on a clear takeover target.
    aiTradeStocks(player);
  }
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
