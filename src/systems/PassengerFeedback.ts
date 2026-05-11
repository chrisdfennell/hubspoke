import { Plane } from '../state/Plane';
import { Route } from '../state/Route';
import { Player } from '../state/Player';
import { GameState } from '../state/GameState';
import { getCity } from '../state/catalog';
import { suggestedTicketPrice } from './Economy';
import { getUpgrade } from '../state/upgrades';

interface FlightResult {
  passengers: number;
  revenue: number;
  profit: number;
  fuel: number;
}

const QUOTE_CHANCE = 0.08;

interface Pool { weight: number; templates: string[]; }

/**
 * Per-arrival passenger reaction. Two parts:
 *
 * 1. **Sentiment → reputation (always applies).** Every successful arrival
 *    computes a small reputation delta based on what passengers actually
 *    experienced — plane condition, equipped upgrades (or lack thereof —
 *    bare planes drag rep down), ticket price vs. fair, and how cramped
 *    the cabin was. Capped per-flight to [-0.10, +0.05] so a single
 *    rough flight can't tank rep, but a sustained pattern (neglected
 *    fleet, gouging prices, no upgrades) drips rep down meaningfully
 *    over a typical play session.
 *
 * 2. **Quote → news (rolls 8% chance).** When the roll hits, picks a
 *    weighted template from pools matching the same flight conditions so
 *    the chatter feels earned. Always 💬-prefixed so HUDScene classifies
 *    quotes under the existing "Your airline" news ticker toggle.
 *
 * The drip composes with `planeReputationPerFlight` (which only ever adds
 * for equipped livery/interior upgrades). Net effect: a player who maxes
 * out upgrades, keeps planes well-maintained, and prices fairly will see
 * rep climb passively; a player who flies bare/neglected at gouge prices
 * will watch it bleed.
 */
export function maybePassengerFeedback(
  player: Player,
  plane: Plane,
  route: Route,
  result: FlightResult,
): void {
  const fromCity = getCity(route.fromCity).name;
  const toCity = getCity(route.toCity).name;
  const airline = player.name;
  const modelName = plane.model.name;
  const seats = plane.model.seats;
  const lf = seats > 0 ? result.passengers / seats : 0;
  const fair = suggestedTicketPrice(
    route.distanceKm,
    getCity(route.fromCity).demand,
    getCity(route.toCity).demand,
  );
  const priceRatio = fair > 0 ? route.ticketPrice / fair : 1;

  const delta = passengerSentimentDelta(plane, priceRatio, lf);
  if (delta !== 0) {
    player.reputation = Math.max(0, Math.min(100, player.reputation + delta));
  }

  if (Math.random() > QUOTE_CHANCE) return;

  const pools: Pool[] = [];

  if (plane.condition < 0.4) {
    pools.push({
      weight: 3,
      templates: [
        `💬 "The ${modelName} was rattling the whole way from ${fromCity}." — nervous flyer about ${airline}`,
        `💬 "Cabin smelled like burnt coffee for two hours. Sort it out, ${airline}." — disappointed`,
        `💬 "I could SEE daylight through the overhead bin seam." — alarmed ${airline} passenger`,
        `💬 "Bumpy ride into ${toCity}. The wings looked tired." — anxious ${airline} flyer`,
      ],
    });
  } else if (plane.condition > 0.92) {
    pools.push({
      weight: 1,
      templates: [
        `💬 "Spotless ${modelName} — felt brand new on the ${fromCity} hop." — frequent ${airline} flyer`,
        `💬 "${airline} keeping the fleet tight. Respect." — aviation buff`,
      ],
    });
  }

  if (plane.upgrades.interior) {
    const u = getUpgrade(plane.upgrades.interior);
    if (u) {
      const name = u.name.toLowerCase();
      pools.push({
        weight: 2,
        templates: [
          `💬 "${airline}'s ${name} are worth every penny." — premium passenger`,
          `💬 "Slept the whole way to ${toCity} in those ${name}." — relaxed ${airline} flyer`,
        ],
      });
    }
  }

  if (plane.upgrades.entertainment) {
    const u = getUpgrade(plane.upgrades.entertainment);
    if (u) {
      const name = u.name.toLowerCase();
      pools.push({
        weight: 2,
        templates: [
          `💬 "${airline}'s ${name} actually worked the whole flight. Miracle." — surprised`,
          `💬 "Binged three movies on the ${fromCity}–${toCity} run thanks to the ${name}." — entertained ${airline} flyer`,
        ],
      });
    }
  }

  if (plane.upgrades.livery) {
    const u = getUpgrade(plane.upgrades.livery);
    if (u) {
      pools.push({
        weight: 1,
        templates: [
          `💬 "${airline}'s ${u.name.toLowerCase()} livery looks sharp on the apron." — plane spotter`,
        ],
      });
    }
  }

  if (priceRatio > 1.3) {
    pools.push({
      weight: 3,
      templates: [
        `💬 "$${route.ticketPrice} ${fromCity}→${toCity}? Daylight robbery from ${airline}." — budget traveler`,
        `💬 "${airline}'s prices on the ${toCity} run are out of control." — angry passenger`,
        `💬 "Switching to a rival next time. ${airline} is way too pricey." — frustrated`,
      ],
    });
  } else if (priceRatio < 0.85) {
    pools.push({
      weight: 2,
      templates: [
        `💬 "$${route.ticketPrice} from ${fromCity} to ${toCity}? Steal of a deal on ${airline}." — bargain hunter`,
        `💬 "${airline} is the only way to fly on a budget." — happy passenger`,
      ],
    });
  }

  if (lf > 0.92) {
    pools.push({
      weight: 1,
      templates: [
        `💬 "Packed ${airline} flight to ${toCity}. Couldn't even reach the lavatory." — cramped`,
        `💬 "Knees in my chin from ${fromCity} to ${toCity}. ${airline}, why." — uncomfortable`,
      ],
    });
  } else if (lf < 0.35) {
    pools.push({
      weight: 1,
      templates: [
        `💬 "Had the whole row to myself on ${airline} to ${toCity}. Luxury." — pleased`,
        `💬 "Quietest ${airline} flight I've ever taken. Half empty." — relaxed`,
      ],
    });
  }

  if (player.reputation > 75) {
    pools.push({
      weight: 2,
      templates: [
        `💬 "Smooth ${airline} flight. Will book again." — happy passenger`,
        `💬 "Crew was fantastic on the ${fromCity}–${toCity} hop with ${airline}." — impressed`,
        `💬 "Connections at ${toCity} were easy. ${airline} runs a tight ship." — efficient traveler`,
      ],
    });
  } else if (player.reputation < 35) {
    pools.push({
      weight: 2,
      templates: [
        `💬 "Late again. ${airline} keeps testing my patience." — fed up`,
        `💬 "Lost my bag on the ${airline} ${toCity} leg. Of course." — bitter`,
        `💬 "Why does ${airline} even bother answering the phone?" — irate`,
      ],
    });
  } else {
    pools.push({
      weight: 1,
      templates: [
        `💬 "Got me to ${toCity} on time. Can't complain about ${airline}." — satisfied`,
        `💬 "${airline}'s ${modelName} is exactly what you'd expect." — neutral`,
        `💬 "Decent ${airline} flight from ${fromCity}. No surprises." — fine`,
      ],
    });
  }

  const total = pools.reduce((s, p) => s + p.weight, 0);
  if (total === 0) return;
  let r = Math.random() * total;
  let chosen: Pool | undefined;
  for (const p of pools) {
    r -= p.weight;
    if (r <= 0) { chosen = p; break; }
  }
  if (!chosen) chosen = pools[pools.length - 1];
  const template = chosen.templates[Math.floor(Math.random() * chosen.templates.length)];

  GameState.get().pushNews(template);
}

/**
 * Reputation delta for a single arrival, in rep-points. Always returns a
 * small number — meaningful only when accumulated across many flights.
 * Capped to [-0.10, +0.05] so one neglected flight doesn't crater rep but
 * a sustained pattern of bare/rough/overpriced flying does.
 */
function passengerSentimentDelta(plane: Plane, priceRatio: number, lf: number): number {
  let d = 0;

  // Bare metal — no upgrades equipped on any slot. Passengers notice.
  const u = plane.upgrades;
  const bare = !u.livery && !u.interior && !u.entertainment;
  if (bare) d -= 0.03;

  // Plane condition.
  if (plane.condition > 0.9)      d += 0.02;
  else if (plane.condition < 0.4) d -= 0.05;
  else if (plane.condition < 0.6) d -= 0.02;

  // Ticket price relative to the suggested fair fare.
  if (priceRatio > 1.30)      d -= 0.04;
  else if (priceRatio < 0.85) d += 0.02;

  // Cramped cabin — knees-in-chin territory.
  if (lf > 0.95) d -= 0.02;

  return Math.max(-0.10, Math.min(0.05, d));
}
