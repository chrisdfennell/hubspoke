import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { getPlaneModel } from '../state/catalog';
import { dateToDay } from '../state/demandModifiers';
import { clock } from './Clock';

/** Default float for a newly-minted airline. Existing logic assumed every
 *  airline had exactly this many shares; with IPO that's now the starting
 *  count, not a hard constant. Use `getFloat()` to read current value. */
export const STARTING_FLOAT = 1_000_000;

/** Current shares outstanding for an airline. Falls back to STARTING_FLOAT
 *  when the airline pre-dates the IPO refactor (legacy saves). */
export function getFloat(airlineId: string): number {
  return GameState.get().sharesOutstanding[airlineId] ?? STARTING_FLOAT;
}

/** Compute "fundamental" share value from cash, fleet, reputation, divided
 *  by the airline's current float. Dilution from issuing shares makes this
 *  fall; buybacks push it up. */
export function fundamentalValue(p: Player): number {
  const fleetValue = p.planes.reduce(
    (sum, plane) => sum + getPlaneModel(plane.modelId).price * plane.condition * 0.4,
    0
  );
  const equity = p.cash + p.savings + fleetValue - p.loan;
  // Reputation modifier: 0..100 → 0.5..1.5
  const repMod = 0.5 + p.reputation / 100;
  const price = (equity / getFloat(p.id)) * repMod;
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

/**
 * Legacy alias preserved for any callers that still want the "default
 * starting float" value. Per-airline current float comes from `getFloat`.
 */
export const FLOAT = STARTING_FLOAT;
export const TAKEOVER_THRESHOLD = 0.5;

/** Find an acquirer who owns more than the takeover threshold of `target`. */
export function findAcquirer(targetId: string): Player | null {
  const state = GameState.get();
  const float = getFloat(targetId);
  for (const p of state.players) {
    if (p.id === targetId) continue;
    const owned = p.holdings[targetId] ?? 0;
    if (owned / float > TAKEOVER_THRESHOLD) return p;
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
    target.dividendPerShare = 0;
    // Clean up the per-pair takeover-alert tiers for this target — they're
    // moot once the airline is fully absorbed.
    for (const key of Object.keys(state.takeoverAlerts)) {
      if (key.startsWith(`${target.id}|`)) delete state.takeoverAlerts[key];
    }
  }
}

/** Quarterly dividend cadence in game-days (90 ≈ 3 months on the 30-day
 *  calendar). Tweak in concert with `DIVIDEND_OPTIONS` for balance. */
export const DIVIDEND_INTERVAL_DAYS = 90;

/** Per-share dividend amounts the StocksScene exposes. Step values keep the
 *  UI simple and the math legible — $0.10 is "token signal," $2 is "we're
 *  printing money so we'd better return some." */
export const DIVIDEND_OPTIONS: number[] = [0, 0.10, 0.50, 1.00, 2.00];

/**
 * Set a per-share quarterly dividend for `issuer`. When transitioning from
 * zero → nonzero, snap `lastDividendDay` to today so the first payout lands
 * a full quarter from now rather than immediately on the next daily tick.
 */
export function setDividend(issuer: Player, perShare: number) {
  const today = dateToDay(GameState.get().date);
  if (issuer.dividendPerShare === 0 && perShare > 0) {
    issuer.lastDividendDay = today;
  }
  issuer.dividendPerShare = Math.max(0, perShare);
}

/**
 * Pay any quarterly dividends that have come due. Cash leaves the issuer
 * for the full float (player-held + public-float — the public's share is
 * lost, as it would be in real life going to anonymous shareholders). Held
 * shares credit each player by `dividendPerShare × ownedShares`.
 *
 * Reputation bonus scales with the per-share rate so a token $0.10
 * dividend gives a small bump and a $2 dividend a real one. Issuer must
 * have the cash on hand — if they can't afford the dividend the payment
 * is skipped (and a news entry warns the player).
 */
export function payDividends() {
  const state = GameState.get();
  const today = dateToDay(state.date);
  for (const issuer of state.players) {
    if (issuer.dividendPerShare <= 0) continue;
    if (state.takenOverBy[issuer.id]) continue;
    if (today - issuer.lastDividendDay < DIVIDEND_INTERVAL_DAYS) continue;

    const float = getFloat(issuer.id);
    const totalCost = Math.round(issuer.dividendPerShare * float);
    if (issuer.cash < totalCost) {
      // Skip but reset the clock so the next attempt is another quarter
      // out, and flag the miss for the human only — AI failures are noise.
      if (!issuer.isAI) {
        state.pushNews(`⚠ ${issuer.name} skipped its quarterly dividend (need ${formatDollarsBrief(totalCost)}, have ${formatDollarsBrief(issuer.cash)}). Reputation −2.`);
        issuer.reputation = Math.max(0, issuer.reputation - 2);
      }
      issuer.lastDividendDay = today;
      continue;
    }

    issuer.cash -= totalCost;
    let paidShareholders = 0;
    for (const holder of state.players) {
      const owned = holder.holdings[issuer.id] ?? 0;
      if (owned <= 0) continue;
      const credit = Math.round(issuer.dividendPerShare * owned);
      holder.cash += credit;
      paidShareholders++;
    }
    issuer.lastDividendDay = today;

    // Investor-friendly: rep up by 1 + the dividend's "weight."
    const repBump = 1 + Math.floor(issuer.dividendPerShare);
    issuer.reputation = Math.min(100, issuer.reputation + repBump);

    if (!issuer.isAI) {
      state.pushNews(`★ ${issuer.name} paid quarterly dividend of $${issuer.dividendPerShare.toFixed(2)}/share — ${formatDollarsBrief(totalCost)} total to ${paidShareholders} shareholder${paidShareholders === 1 ? '' : 's'}. Reputation +${repBump}.`);
    } else {
      // Only notify human if they actually held the dividend-paying rival.
      const humanHeld = state.human.holdings[issuer.id] ?? 0;
      if (humanHeld > 0) {
        const credit = Math.round(issuer.dividendPerShare * humanHeld);
        state.pushNews(`${issuer.name} dividend: +${formatDollarsBrief(credit)} on your ${humanHeld.toLocaleString('en-US')} shares.`);
      }
    }
  }
}

/**
 * Fire a news entry the first time any rival crosses 25% / 40% ownership
 * of any target. Per-tier, per-pair: each (target, acquirer) combination
 * announces at most once per tier per run. Cleared when the target is
 * fully acquired (>50% triggers the takeover flow itself).
 */
export function checkTakeoverAlerts() {
  const state = GameState.get();
  const TIERS = [25, 40];
  for (const target of state.players) {
    if (state.takenOverBy[target.id]) continue;
    const float = getFloat(target.id);
    for (const acquirer of state.players) {
      if (acquirer.id === target.id) continue;
      const owned = acquirer.holdings[target.id] ?? 0;
      if (owned <= 0) continue;
      const pct = (owned / float) * 100;
      const key = `${target.id}|${acquirer.id}`;
      const prev = state.takeoverAlerts[key] ?? 0;
      // Find the highest tier this ownership crosses that hasn't fired.
      let newTier = prev;
      for (const t of TIERS) {
        if (pct >= t && prev < t) newTier = t;
      }
      if (newTier > prev) {
        state.takeoverAlerts[key] = newTier;
        const targetingHuman = target.id === state.human.id;
        const prefix = targetingHuman ? '⚠ ' : '';
        state.pushNews(`${prefix}${acquirer.name} now holds ${newTier}%+ of ${target.name} (${owned.toLocaleString('en-US')} shares).`);
      }
    }
  }
}

/** Brief $ formatter for news lines — keeps headlines short. */
function formatDollarsBrief(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function registerStockHooks() {
  clock.onDay(() => {
    updateStockPrices();
    payDividends();
    checkTakeoverAlerts();
    resolveTakeovers();
  });
}

/** Buy n shares of `airlineId` from the market. Returns true on success. */
export function buyShares(buyer: Player, airlineId: string, n: number): boolean {
  if (n <= 0) return false;
  const state = GameState.get();
  const price = state.stockPrices[airlineId];
  if (!price) return false;
  const cost = price * n;
  if (buyer.cash < cost) return false;
  buyer.cash -= cost;
  buyer.holdings[airlineId] = (buyer.holdings[airlineId] ?? 0) + n;
  // Buying pressure scales with the trade's fraction of current float —
  // an issued-out airline (bigger float) absorbs the same dollar order
  // with less price movement, which is correct.
  state.stockPrices[airlineId] = price * (1 + (n / getFloat(airlineId)) * 0.5);
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
  state.stockPrices[airlineId] = Math.max(1, price * (1 - (n / getFloat(airlineId)) * 0.5));
  return true;
}

/** Public-float shares: how many shares are NOT held by any known player.
 *  Buybacks can only retire from this pool — you can't retire shares that
 *  a rival is sitting on without their consent. */
export function publicFloat(airlineId: string): number {
  const state = GameState.get();
  let held = 0;
  for (const p of state.players) {
    held += p.holdings[airlineId] ?? 0;
  }
  return Math.max(0, getFloat(airlineId) - held);
}

/** Cap on a single IPO round: 25% of current float. Prevents a one-shot
 *  doubling of shares which would tank the market price too brutally. */
export const MAX_IPO_FRACTION = 0.25;

/**
 * Mint n new shares of `issuer` and sell them into the float at the
 * current market price. `issuer.cash` rises; `state.sharesOutstanding[id]`
 * grows by n. Price drifts down on the next price update because the same
 * equity is split across more shares.
 */
export function issueShares(issuer: Player, n: number): { ok: true; raised: number } | { ok: false; reason: string } {
  if (n <= 0) return { ok: false, reason: 'Issue count must be positive' };
  const state = GameState.get();
  const price = state.stockPrices[issuer.id];
  if (!price) return { ok: false, reason: 'No market price' };
  const float = getFloat(issuer.id);
  if (n > float * MAX_IPO_FRACTION) {
    return { ok: false, reason: `Single round capped at ${Math.floor(MAX_IPO_FRACTION * 100)}% of float` };
  }
  const raised = Math.round(price * n);
  issuer.cash += raised;
  state.sharesOutstanding[issuer.id] = float + n;
  // Dilution pressure on price: shrink by the issued fraction so the
  // tomorrow-fundamental drop doesn't catch the player off guard.
  state.stockPrices[issuer.id] = Math.max(1, price * (1 - (n / float) * 0.5));
  return { ok: true, raised };
}

/**
 * Retire n shares of `issuer` at the current market price. Cash leaves
 * the issuer; the float shrinks. Caller can only buy back from the
 * `publicFloat` — shares already held by named players are off-limits.
 */
export function buyBackShares(issuer: Player, n: number): { ok: true; cost: number } | { ok: false; reason: string } {
  if (n <= 0) return { ok: false, reason: 'Buyback count must be positive' };
  const state = GameState.get();
  const price = state.stockPrices[issuer.id];
  if (!price) return { ok: false, reason: 'No market price' };
  const pub = publicFloat(issuer.id);
  if (n > pub) return { ok: false, reason: `Only ${pub.toLocaleString('en-US')} shares free-floating` };
  const cost = Math.round(price * n);
  if (issuer.cash < cost) return { ok: false, reason: 'Insufficient cash' };
  issuer.cash -= cost;
  state.sharesOutstanding[issuer.id] = getFloat(issuer.id) - n;
  // Shrinking the float at constant equity nudges fundamental up.
  state.stockPrices[issuer.id] = price * (1 + (n / Math.max(1, pub)) * 0.4);
  return { ok: true, cost };
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
