import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { getPlaneModel } from '../state/catalog';
import { clock } from './Clock';

/** Compute "fundamental" share value from cash, fleet, reputation. */
export function fundamentalValue(p: Player): number {
  const fleetValue = p.planes.reduce(
    (sum, plane) => sum + getPlaneModel(plane.modelId).price * plane.condition * 0.4,
    0
  );
  const equity = p.cash + p.savings + fleetValue - p.loan;
  // Reputation modifier: 0..100 → 0.5..1.5
  const repMod = 0.5 + p.reputation / 100;
  // 1,000,000 shares outstanding per airline; price = equity / 1M * repMod, floor $5.
  const price = (equity / 1_000_000) * repMod;
  return Math.max(5, price);
}

/**
 * Daily price update: drift current price toward fundamental with a little noise.
 */
export function updateStockPrices() {
  const state = GameState.get();
  for (const p of state.players) {
    const target = fundamentalValue(p);
    const current = state.stockPrices[p.id] ?? target;
    const noise = (Math.random() - 0.5) * (target * 0.05);
    const next = current + (target - current) * 0.25 + noise;
    state.stockPrices[p.id] = Math.max(1, next);
  }
}

/** Total shares outstanding per airline. */
export const FLOAT = 1_000_000;
export const TAKEOVER_THRESHOLD = 0.5;

/** Find an acquirer who owns more than the takeover threshold of `target`. */
export function findAcquirer(targetId: string): Player | null {
  const state = GameState.get();
  for (const p of state.players) {
    if (p.id === targetId) continue;
    const owned = p.holdings[targetId] ?? 0;
    if (owned / FLOAT > TAKEOVER_THRESHOLD) return p;
  }
  return null;
}

/** Resolve takeovers: transfer cash, fleet, routes; record acquisition. */
export function resolveTakeovers() {
  const state = GameState.get();
  for (const target of [...state.players]) {
    if (state.takenOverBy[target.id]) continue;
    const acquirer = findAcquirer(target.id);
    if (!acquirer) continue;
    state.takenOverBy[target.id] = acquirer.id;
    state.pushNews(`★ ${acquirer.name} acquired ${target.name} via majority shareholding.`);
    state.gameEvents.unshift({
      id: `takeover-${target.id}`,
      date: { ...state.date },
      severity: acquirer.id === state.human.id ? 'good' : 'bad',
      headline: `${acquirer.name} acquires ${target.name}`,
      body: `Crossing the 50% ownership threshold has triggered a regulatory-mandated takeover. ${target.name}'s assets are absorbed.`,
      impact: `${target.name} eliminated; ${acquirer.name} fleet +${target.planes.length}, cash +$${Math.round(target.cash).toLocaleString('en-US')}`,
    });
    // Transfer assets.
    acquirer.cash += target.cash;
    acquirer.savings += target.savings;
    acquirer.loan += target.loan;
    for (const plane of target.planes) acquirer.planes.push(plane);
    for (const route of target.routes) {
      route.ownerId = acquirer.id;
      acquirer.routes.push(route);
    }
    target.cash = 0; target.savings = 0; target.loan = 0;
    target.planes = []; target.routes = [];
  }
}

export function registerStockHooks() {
  clock.onDay(() => {
    updateStockPrices();
    resolveTakeovers();
  });
}

/** Buy n shares of `airlineId` from the market. Returns true on success. */
export function buyShares(buyer: Player, airlineId: string, n: number): boolean {
  if (n <= 0) return false;
  const state = GameState.get();
  const price = state.stockPrices[airlineId];
  if (!price) return false;
  // Buying nudges the price up: 0.1% per 1% of float (1M shares).
  const cost = price * n;
  if (buyer.cash < cost) return false;
  buyer.cash -= cost;
  buyer.holdings[airlineId] = (buyer.holdings[airlineId] ?? 0) + n;
  state.stockPrices[airlineId] = price * (1 + (n / 1_000_000) * 0.5);
  return true;
}

/** Sell n shares of `airlineId`. Returns true on success. */
export function sellShares(seller: Player, airlineId: string, n: number): boolean {
  if (n <= 0) return false;
  const owned = seller.holdings[airlineId] ?? 0;
  if (owned < n) return false;
  const state = GameState.get();
  const price = state.stockPrices[airlineId];
  if (!price) return false;
  const proceeds = price * n;
  seller.cash += proceeds;
  seller.holdings[airlineId] = owned - n;
  state.stockPrices[airlineId] = Math.max(1, price * (1 - (n / 1_000_000) * 0.5));
  return true;
}

/** Total market value of one player's portfolio. */
export function portfolioValue(p: Player): number {
  const state = GameState.get();
  let total = 0;
  for (const id in p.holdings) {
    total += (state.stockPrices[id] ?? 0) * p.holdings[id];
  }
  return total;
}
