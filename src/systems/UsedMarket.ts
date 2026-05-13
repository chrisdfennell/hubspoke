import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { Plane } from '../state/Plane';
import { PLANE_MODELS, getPlaneModel } from '../state/catalog';
import { dateToDay } from '../state/demandModifiers';
import { clock } from './Clock';

/**
 * One listing on the public used-plane market. Listings don't carry the
 * original plane's id, name, or upgrades — those stay with the seller's
 * legal entity. A buyer gets a fresh airframe at the listed condition.
 */
export interface UsedPlaneListing {
  /** Synthetic id for save/load + UI keying. */
  id: string;
  modelId: string;
  /** 0..1 — what the buyer is shopping. Repair cost is the buyer's. */
  condition: number;
  /** Asking price set at listing time. Doesn't drift; expires after
   *  LISTING_DAYS instead. */
  askPrice: number;
  /** Game-day index the listing appeared. */
  listedOnDay: number;
  /** Cosmetic — "owned by X" or "fresh from market" for UI flavor. */
  sourceLabel: string;
}

let _listingCounter = 1;
const nextListingId = () => `u${_listingCounter++}`;

export function setUsedListingCounter(n: number) {
  _listingCounter = Math.max(_listingCounter, n);
}
export function getUsedListingCounter(): number {
  return _listingCounter;
}

/** Target size of the market. The daily refresh tops up to this. */
export const MARKET_TARGET = 6;
/** Listings older than this expire and are removed. */
export const LISTING_DAYS = 30;
/** Seller payout multiplier: model.price × max(condition, 0.1) × this. */
export const SELL_MULT = 0.6;
/** Buyer cost multiplier: model.price × condition × this. */
export const BUY_MULT = 0.75;

/** Floor condition for sale payouts so a 5%-condition wreck still
 *  recovers some scrap value rather than handing the seller $0. */
export const MIN_SELL_CONDITION = 0.1;

/** Sale price the player receives for selling one of their own planes. */
export function sellPriceFor(plane: Plane): number {
  const m = getPlaneModel(plane.modelId);
  return Math.round(m.price * Math.max(plane.condition, MIN_SELL_CONDITION) * SELL_MULT);
}

/** Asking price for a used listing — what a buyer pays. */
export function askPriceFor(modelId: string, condition: number): number {
  const m = getPlaneModel(modelId);
  return Math.round(m.price * condition * BUY_MULT);
}

/**
 * Sell one of `seller`'s planes onto the used market. The plane is removed
 * from the seller's fleet, a listing is added to `state.usedPlanes`, and
 * the seller is credited `sellPriceFor(plane)`. Idle-only — you can't sell
 * a plane that's mid-flight or in maintenance.
 *
 * Upgrades are dropped on sale (real-world: buyer strips the interior).
 * The route assignment goes too; any pilots/mechanics stay on the books
 * for the seller to redeploy onto a different plane.
 */
export function sellPlane(seller: Player, planeId: string): { ok: true; price: number } | { ok: false; reason: string } {
  const state = GameState.get();
  const idx = seller.planes.findIndex(p => p.id === planeId);
  if (idx < 0) return { ok: false, reason: 'Plane not found' };
  const plane = seller.planes[idx];
  if (plane.status.kind !== 'idle') return { ok: false, reason: 'Plane must be idle to sell' };

  const price = sellPriceFor(plane);
  const ask = askPriceFor(plane.modelId, plane.condition);

  // Remove from seller fleet.
  seller.planes.splice(idx, 1);
  seller.cash += price;

  // Add to public market.
  state.usedPlanes.push({
    id: nextListingId(),
    modelId: plane.modelId,
    condition: plane.condition,
    askPrice: ask,
    listedOnDay: dateToDay(state.date),
    sourceLabel: `ex-${seller.name}`,
  });

  return { ok: true, price };
}

/**
 * Buy a used listing for `buyer`. Listing is removed from the market and
 * a fresh Plane object lands in `buyer.planes` parked at `parkAt` with the
 * listing's condition. The buyer takes on whatever repair cost the
 * condition implies (paid later in the Workshop).
 */
export function buyUsedPlane(buyer: Player, listingId: string, parkAt: string): { ok: true; planeId: string } | { ok: false; reason: string } {
  const state = GameState.get();
  const idx = state.usedPlanes.findIndex(l => l.id === listingId);
  if (idx < 0) return { ok: false, reason: 'Listing not found' };
  const listing = state.usedPlanes[idx];
  if (buyer.cash < listing.askPrice) return { ok: false, reason: 'Cannot afford' };

  buyer.cash -= listing.askPrice;
  const plane = new Plane(listing.modelId, parkAt);
  // Used planes don't arrive pristine — that's the whole point.
  plane.condition = listing.condition;
  buyer.planes.push(plane);
  state.usedPlanes.splice(idx, 1);
  return { ok: true, planeId: plane.id };
}

/**
 * Daily refresh: expire old listings, then top the market up to the
 * target size by minting random listings. Synthetic listings represent
 * "the rest of the industry" so the market never feels dead even before
 * the human starts selling. Random condition range 0.4..0.75 — chunky
 * but recoverable, never near-pristine (those would undercut new-plane
 * sales too aggressively).
 */
export function refreshUsedMarket() {
  const state = GameState.get();
  const today = dateToDay(state.date);
  // Expire stale listings first.
  for (let i = state.usedPlanes.length - 1; i >= 0; i--) {
    if (today - state.usedPlanes[i].listedOnDay >= LISTING_DAYS) {
      state.usedPlanes.splice(i, 1);
    }
  }
  // Top up the market. Synthetic listings tagged "market" so the UI can
  // tell them apart from player-trade-in listings.
  while (state.usedPlanes.length < MARKET_TARGET) {
    const model = PLANE_MODELS[Math.floor(Math.random() * PLANE_MODELS.length)];
    const condition = 0.4 + Math.random() * 0.35;
    state.usedPlanes.push({
      id: nextListingId(),
      modelId: model.id,
      condition,
      askPrice: askPriceFor(model.id, condition),
      listedOnDay: today,
      sourceLabel: 'market',
    });
  }
}

export function registerUsedMarketHooks() {
  clock.onDay(() => refreshUsedMarket());
}
