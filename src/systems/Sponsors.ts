import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { Route } from '../state/Route';
import { CITIES, getCity } from '../state/catalog';
import { SponsorContract } from '../state/Sponsor';
import { dateToDay } from '../state/demandModifiers';
import { clock, formatMoney } from './Clock';
import { sound } from './Sound';

const MAX_OFFERS = 3;
const MAX_ACTIVE = 3;
const NEW_OFFER_CHANCE = 0.35;
const OFFER_DURATION_DAYS = 3;

const SPONSOR_BRANDS = [
  'Pacific Adventure Tours',
  'Coca-Air',
  'GlobalReach Travel',
  'Sunrise Hospitality',
  'Skyline Beverages',
  'Horizon Resorts',
  'Trinity Logistics',
  'Wanderlux Vacations',
  'Aurora Telecom',
  'Atlas Insurance',
  'Northwind Energy',
  'Lumen Outdoor Co.',
  'BlueWave Cosmetics',
  'Apex Motors',
  'Solstice Apparel',
];

const SPONSOR_PITCHES = [
  'wants to fly its conference attendees',
  'is launching a tourism campaign',
  'needs to shuttle its sales force',
  'is sponsoring a sports team',
  'is hosting a product launch',
  'is filming a travel series',
  'is rewarding its top retailers',
  'is staffing up a regional office',
];

let _counter = 1;
const nextId = () => `sp${_counter++}`;

function rollSponsor(state: GameState): SponsorContract {
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  const today = dateToDay(state.date);

  // Target: 500-2000 base, scaled by city demand. Hot cities get bigger
  // sponsors (Los Angeles attracts a brand bigger than Pago Pago).
  const baseTarget = 500 + Math.floor(Math.random() * 1500);
  const target = Math.round(baseTarget * (0.6 + city.demand));

  // Reward: $28-40 per passenger, so a 2,000-pax sponsor pays ~$68k.
  // Roughly 2.5-3.5× what those passengers would pay in ticket revenue,
  // which makes accepting genuinely valuable but won't trivialize the
  // economy.
  const ratePerPax = 28 + Math.random() * 12;
  const reward = Math.round(target * ratePerPax);

  // Duration: 7-21 days. Tight contracts for small targets, longer for big.
  const durationDays = 7 + Math.floor(Math.random() * 15);

  const brand = SPONSOR_BRANDS[Math.floor(Math.random() * SPONSOR_BRANDS.length)];
  const pitch = SPONSOR_PITCHES[Math.floor(Math.random() * SPONSOR_PITCHES.length)];

  return {
    id: nextId(),
    brand,
    pitch,
    toCity: city.id,
    target,
    progress: 0,
    offerExpiresOnDay: today + OFFER_DURATION_DAYS,
    // deadlineDay is recomputed relative to acceptance day in acceptSponsor;
    // we still seed a value here so the offer card can show a tentative
    // duration before the player commits.
    deadlineDay: today + durationDays,
    reward,
    repReward: 3 + Math.floor(Math.random() * 4),
    repPenalty: 2,
    status: 'available',
  };
}

/** Daily housekeeping: expire stale offers, maybe roll a new one. */
function rollDailyOffers() {
  const state = GameState.get();
  const today = dateToDay(state.date);

  // Move expired offers to history.
  const stillAvailable: SponsorContract[] = [];
  for (const s of state.sponsorOffers) {
    if (s.offerExpiresOnDay <= today) {
      s.status = 'expired';
      state.sponsorCompleted.push(s);
    } else {
      stillAvailable.push(s);
    }
  }
  state.sponsorOffers = stillAvailable;

  if (state.sponsorOffers.length < MAX_OFFERS && Math.random() < NEW_OFFER_CHANCE) {
    const offer = rollSponsor(state);
    state.sponsorOffers.push(offer);
    state.pushNews(
      `✦ ${offer.brand} ${offer.pitch} to ${getCity(offer.toCity).name} — ${offer.target.toLocaleString('en-US')} pax for ${formatMoney(offer.reward)}.`,
    );
    sound.play('sponsor');
  }
}

/** Resolve any active contracts that hit their deadline or their target. */
function resolveActive() {
  const state = GameState.get();
  const today = dateToDay(state.date);
  const resolved: SponsorContract[] = [];

  for (const s of state.sponsorActive) {
    if (s.progress >= s.target) {
      s.status = 'completed';
      const player = state.players.find(p => p.id === s.ownerId);
      if (player) {
        player.cash += s.reward;
        player.reputation = Math.min(100, player.reputation + s.repReward);
        if (!player.isAI) {
          state.pushNews(
            `★ ${s.brand} contract fulfilled — ${formatMoney(s.reward)} paid, +${s.repReward} reputation.`,
          );
        }
      }
      resolved.push(s);
    } else if (today >= s.deadlineDay) {
      s.status = 'failed';
      const player = state.players.find(p => p.id === s.ownerId);
      if (player) {
        player.reputation = Math.max(0, player.reputation - s.repPenalty);
        if (!player.isAI) {
          state.pushNews(
            `⚠ ${s.brand} contract failed — ${s.progress.toLocaleString('en-US')} / ${s.target.toLocaleString('en-US')} pax. −${s.repPenalty} reputation.`,
          );
        }
      }
      resolved.push(s);
    }
  }

  state.sponsorActive = state.sponsorActive.filter(s => !resolved.includes(s));
  state.sponsorCompleted.push(...resolved);
}

/** Accept an available offer. Returns false if it's already gone, already at
 *  the active cap, or no longer 'available'. */
export function acceptSponsor(player: Player, sponsorId: string): boolean {
  const state = GameState.get();
  const idx = state.sponsorOffers.findIndex(s => s.id === sponsorId);
  if (idx < 0) return false;
  const s = state.sponsorOffers[idx];
  if (s.status !== 'available') return false;
  const playerActive = state.sponsorActive.filter(a => a.ownerId === player.id).length;
  if (playerActive >= MAX_ACTIVE) return false;

  // Reset deadline to be relative to TODAY rather than the day the offer was
  // generated. Without this, accepting a 7-day deal on day 3 of its 3-day
  // offer window would leave you with only 4 days to deliver.
  const today = dateToDay(state.date);
  const offerCreatedDay = s.offerExpiresOnDay - OFFER_DURATION_DAYS;
  const originalDuration = s.deadlineDay - offerCreatedDay;
  s.deadlineDay = today + originalDuration;

  s.status = 'active';
  s.ownerId = player.id;
  state.sponsorOffers.splice(idx, 1);
  state.sponsorActive.push(s);

  if (!player.isAI) {
    state.pushNews(
      `Accepted ${s.brand} contract — ${s.target.toLocaleString('en-US')} pax to ${getCity(s.toCity).name} in ${originalDuration} days.`,
    );
  }
  return true;
}

/** Decline an available offer. */
export function declineSponsor(sponsorId: string): boolean {
  const state = GameState.get();
  const idx = state.sponsorOffers.findIndex(s => s.id === sponsorId);
  if (idx < 0) return false;
  const s = state.sponsorOffers[idx];
  s.status = 'expired';
  state.sponsorOffers.splice(idx, 1);
  state.sponsorCompleted.push(s);
  return true;
}

/** Called from Flights.landArrivedPlanes for every successful arrival.
 *  Increments progress on every matching active sponsor. */
export function trackArrival(player: Player, route: Route, passengers: number): void {
  if (player.isAI) return;   // sponsors are human-only
  const state = GameState.get();
  for (const s of state.sponsorActive) {
    if (s.ownerId !== player.id) continue;
    if (s.toCity !== route.toCity) continue;
    s.progress += passengers;
  }
}

export function registerSponsorHooks(): void {
  clock.onDay(() => {
    resolveActive();
    rollDailyOffers();
  });
}
