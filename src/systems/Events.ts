import { GameState, GameDate } from '../state/GameState';
import { CITIES, getCity } from '../state/catalog';
import { getFuelPrice, setFuelPrice } from './Economy';
import { applyDemandMod } from '../state/demandModifiers';
import { applyWeatherHazard } from '../state/weatherHazards';
import { getDifficulty } from '../state/Difficulty';
import { sound } from './Sound';
import { clock } from './Clock';

export type EventSeverity = 'good' | 'bad' | 'neutral';

export interface GameEvent {
  id: string;
  date: GameDate;
  severity: EventSeverity;
  headline: string;
  body: string;
  /** Short summary of mechanical effect, e.g. "Fuel +30% for 7 days". */
  impact: string;
}

const PACIFIC_CITY_IDS = ['hnl', 'ogg', 'koa', 'ito', 'lih', 'ppg', 'pap'];
const INTERCONTINENTAL_IDS = ['lhr', 'cdg', 'fra', 'nrt', 'syd', 'sin', 'dxb', 'gru', 'jnb'];

// Weather climate buckets — used by the weather event blueprints so
// snowstorms hit Boston rather than Honolulu. Cities not listed in any
// bucket get default treatment for that weather kind (i.e. tornadoes
// won't try to hit Singapore). Identifiers reference the catalog city ids.
const TROPICAL_STORM_IDS  = ['hnl', 'ogg', 'koa', 'ito', 'lih', 'ppg', 'pap', 'mia', 'sju', 'mco', 'tpa', 'mex', 'gru', 'kul', 'sin', 'bom', 'hkg', 'bkk', 'pap'];
const COLD_WINTER_IDS     = ['ord', 'jfk', 'bos', 'msp', 'dtw', 'cle', 'pit', 'phl', 'ewr', 'iad', 'bwi', 'yyz', 'yvr', 'sea', 'pdx', 'den', 'slc', 'anc', 'fra', 'muc', 'cdg', 'lhr', 'ams', 'fco', 'mad', 'vie', 'ist', 'pek', 'icn', 'nrt'];
const HEATWAVE_IDS        = ['lax', 'sfo', 'phx', 'las', 'iah', 'dfw', 'aus', 'atl', 'mia', 'mco', 'tpa', 'mad', 'fco', 'ist', 'del', 'bom', 'dxb', 'doh', 'mex', 'syd', 'jnb', 'cpt'];
const FOG_IDS             = ['sfo', 'lhr', 'cdg', 'sea', 'pdx', 'ams', 'fra', 'muc', 'bos', 'jfk', 'ewr', 'pit', 'ord', 'pek', 'icn', 'nrt'];

function pickFrom(ids: readonly string[]): string {
  return ids[Math.floor(Math.random() * ids.length)];
}

let eventCounter = 1;
const nextId = () => `e${eventCounter++}`;

/** Severity scalar from settings. 0 suppresses event rolls entirely (handled
 *  in maybeRollEvent); 0.5/1.0/1.5 scale impact magnitudes inside blueprints
 *  via scaledMult/scaledDelta. */
function severityScalar(): number {
  switch (GameState.get().settings.eventSeverity) {
    case 'off':    return 0;
    case 'mild':   return 0.5;
    case 'harsh':  return 1.5;
    case 'normal':
    default:       return 1.0;
  }
}
/** Pull a demand multiplier toward 1.0 by (1 - scalar). At scalar=1.0 the
 *  multiplier is unchanged; at scalar=0.5 a 0.5× hurricane becomes 0.75×
 *  and a 1.5× boom becomes 1.25×. */
function scaledMult(mult: number): number {
  return 1 + (mult - 1) * severityScalar();
}
/** Scale a flat additive impact (reputation delta, condition multiplier
 *  reduction, etc). At scalar=0.5 a -5 reputation hit becomes -2.5. */
function scaledDelta(delta: number): number {
  return delta * severityScalar();
}

interface EventBlueprint {
  weight: number;
  fire: (state: GameState) => GameEvent | null;
}

const BLUEPRINTS: EventBlueprint[] = [
  // Oil price spike
  {
    weight: 8,
    fire: (state) => {
      const old = getFuelPrice();
      const factor = 1.20 + Math.random() * 0.20;
      setFuelPrice(old * factor);
      const pct = Math.round((factor - 1) * 100);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: 'OPEC cuts output — fuel prices surge',
        body: `Crude jumped after a surprise quota cut. Carriers brace for higher operating costs.`,
        impact: `Fuel price +${pct}% (now $${getFuelPrice().toFixed(2)}/L)`,
      };
    },
  },
  // Oil price drop
  {
    weight: 5,
    fire: (state) => {
      const old = getFuelPrice();
      const factor = 0.80 + Math.random() * 0.10;
      setFuelPrice(old * factor);
      const pct = Math.round((1 - factor) * 100);
      return {
        id: nextId(), date: { ...state.date }, severity: 'good',
        headline: 'Refinery oversupply pushes fuel down',
        body: `Spot fuel prices dropped after Asian refineries reported a surplus.`,
        impact: `Fuel price −${pct}% (now $${getFuelPrice().toFixed(2)}/L)`,
      };
    },
  },
  // Pacific hurricane
  {
    weight: 4,
    fire: (state) => {
      for (const id of PACIFIC_CITY_IDS) applyDemandMod(id, scaledMult(0.5), 5, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: 'Hurricane disrupts Pacific travel',
        body: `A category-3 storm system across the central Pacific has airlines cancelling discretionary flights.`,
        impact: 'Pacific city demand −50% for 5 days',
      };
    },
  },
  // Volcanic eruption (Big Island)
  {
    weight: 2,
    fire: (state) => {
      ['ito', 'koa'].forEach(id => applyDemandMod(id, scaledMult(0.3), 5, state.date));
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: 'Mauna Loa erupts — airspace closures',
        body: `Volcanic ash plumes have grounded several inter-island flights to Hilo and Kona.`,
        impact: 'Hilo & Kona demand −70% for 5 days',
      };
    },
  },

  // ----- Weather events. Each pairs a demand mod (passengers don't show
  // up) with a weather hazard (mishaps more likely on landing). Severity
  // scaler in settings controls magnitude. -----

  // Thunderstorm cluster at a tropical city
  {
    weight: 6,
    fire: (state) => {
      const cityId = pickFrom(TROPICAL_STORM_IDS);
      const city = getCity(cityId);
      applyDemandMod(cityId, scaledMult(0.65), 2, state.date);
      applyWeatherHazard(cityId, 1 + scaledDelta(0.4), 2, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: `Thunderstorm cluster grounds flights at ${city.name}`,
        body: `Severe weather over ${city.name} is forcing diversions. Approaches are turbulent enough to keep planes on the ground.`,
        impact: `${city.name} demand −35%, mishap chance +40% for 2 days`,
      };
    },
  },

  // Hurricane / typhoon making landfall (tropical, worse than thunderstorm)
  {
    weight: 3,
    fire: (state) => {
      const cityId = pickFrom(TROPICAL_STORM_IDS);
      const city = getCity(cityId);
      applyDemandMod(cityId, scaledMult(0.30), 5, state.date);
      applyWeatherHazard(cityId, 1 + scaledDelta(1.0), 5, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: `Hurricane bears down on ${city.name}`,
        body: `A major tropical storm is making landfall near ${city.name}. Airports are shutting their runways through the system.`,
        impact: `${city.name} demand −70%, mishap chance +100% for 5 days`,
      };
    },
  },

  // Blizzard at a cold-climate city
  {
    weight: 5,
    fire: (state) => {
      const cityId = pickFrom(COLD_WINTER_IDS);
      const city = getCity(cityId);
      applyDemandMod(cityId, scaledMult(0.55), 3, state.date);
      applyWeatherHazard(cityId, 1 + scaledDelta(0.6), 3, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: `Blizzard hits ${city.name} — de-icing chaos`,
        body: `Heavy snow at ${city.name} has stretched de-icing crews thin and forced cancellations across the board.`,
        impact: `${city.name} demand −45%, mishap chance +60% for 3 days`,
      };
    },
  },

  // Dense fog (multiple foggy-prone airports)
  {
    weight: 6,
    fire: (state) => {
      const cityId = pickFrom(FOG_IDS);
      const city = getCity(cityId);
      applyDemandMod(cityId, scaledMult(0.80), 1, state.date);
      applyWeatherHazard(cityId, 1 + scaledDelta(0.25), 1, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: `Dense fog blankets ${city.name}`,
        body: `Visibility at ${city.name} is well below approach minimums for most of the day.`,
        impact: `${city.name} demand −20%, mishap chance +25% for 1 day`,
      };
    },
  },

  // Heatwave (LF dip, slightly elevated mishap chance from longer takeoff rolls)
  {
    weight: 4,
    fire: (state) => {
      const cityId = pickFrom(HEATWAVE_IDS);
      const city = getCity(cityId);
      applyDemandMod(cityId, scaledMult(0.85), 4, state.date);
      applyWeatherHazard(cityId, 1 + scaledDelta(0.15), 4, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: `Record heatwave grounds afternoon flights in ${city.name}`,
        body: `Temperatures at ${city.name} are pushing past aircraft performance limits, forcing weight restrictions and delays.`,
        impact: `${city.name} demand −15%, mishap chance +15% for 4 days`,
      };
    },
  },

  // Ice storm — combo of demand crater + sharp mishap bump
  {
    weight: 2,
    fire: (state) => {
      const cityId = pickFrom(COLD_WINTER_IDS);
      const city = getCity(cityId);
      applyDemandMod(cityId, scaledMult(0.40), 2, state.date);
      applyWeatherHazard(cityId, 1 + scaledDelta(0.8), 2, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: `Ice storm shuts ${city.name}`,
        body: `Freezing rain has coated runways and aircraft at ${city.name}. Ground handlers can barely keep up.`,
        impact: `${city.name} demand −60%, mishap chance +80% for 2 days`,
      };
    },
  },
  // Tourism boom
  {
    weight: 6,
    fire: (state) => {
      const dest = CITIES[Math.floor(Math.random() * CITIES.length)];
      applyDemandMod(dest.id, scaledMult(1.5), 7, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'good',
        headline: `Tourism boom in ${dest.name}`,
        body: `${dest.name} reports a surge in inbound bookings after a viral travel feature went online.`,
        impact: `${dest.name} demand +50% for 7 days`,
      };
    },
  },
  // Industry strike
  {
    weight: 3,
    fire: (state) => {
      for (const p of state.players) p.reputation = Math.max(0, p.reputation - scaledDelta(5));
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: 'Cabin crew strike grounds half the industry',
        body: `Industry-wide labor dispute is hammering airline reputations across the board.`,
        impact: 'All airlines reputation −5',
      };
    },
  },
  // Air show
  {
    weight: 4,
    fire: (state) => {
      applyDemandMod('hnl', scaledMult(1.3), 3, state.date);
      for (const p of state.players) p.reputation = Math.min(100, p.reputation + scaledDelta(2));
      return {
        id: nextId(), date: { ...state.date }, severity: 'good',
        headline: 'Honolulu Air Show draws record crowds',
        body: `Hawaii's annual air show packed the airport this weekend.`,
        impact: 'Honolulu demand +30% for 3 days, all reputation +2',
      };
    },
  },
  // Trade agreement
  {
    weight: 2,
    fire: (state) => {
      for (const id of INTERCONTINENTAL_IDS) applyDemandMod(id, scaledMult(1.10), 14, state.date);
      return {
        id: nextId(), date: { ...state.date }, severity: 'good',
        headline: 'New open-skies agreement signed',
        body: `Bilateral aviation treaties unlock fresh long-haul demand.`,
        impact: 'Intercontinental demand +10% for 14 days',
      };
    },
  },
  // Rival scandal — picks an AI rival
  {
    weight: 4,
    fire: (state) => {
      const rivals = state.players.filter(p => p.isAI && !state.takenOverBy[p.id]);
      if (rivals.length === 0) return null;
      const target = rivals[Math.floor(Math.random() * rivals.length)];
      target.reputation = Math.max(0, target.reputation - scaledDelta(12));
      return {
        id: nextId(), date: { ...state.date }, severity: 'neutral',
        headline: `${target.name} hit by maintenance scandal`,
        body: `Reports surface that ${target.name} cut corners on safety inspections — passengers are switching carriers.`,
        impact: `${target.name} reputation −12`,
      };
    },
  },
  // Aircraft mishap (rival or you, weighted toward AI)
  {
    weight: 3,
    fire: (state) => {
      const candidates = state.players.filter(p => p.planes.length > 0);
      if (candidates.length === 0) return null;
      const human = state.players[state.humanIndex];
      const target = Math.random() < 0.85 && candidates.some(p => p.isAI)
        ? candidates.filter(p => p.isAI)[Math.floor(Math.random() * candidates.filter(p => p.isAI).length)]
        : candidates[Math.floor(Math.random() * candidates.length)];
      target.reputation = Math.max(0, target.reputation - scaledDelta(8));
      // Damage one of their planes. Magnitude scales with severity: at 'mild'
      // condition drops 25% instead of 50%; at 'harsh' it drops 75%.
      const plane = target.planes[Math.floor(Math.random() * target.planes.length)];
      plane.condition = Math.max(0.1, plane.condition * (1 - scaledDelta(0.5)));
      void human;
      return {
        id: nextId(), date: { ...state.date }, severity: target === state.players[state.humanIndex] ? 'bad' : 'neutral',
        headline: `${target.name} flight ${plane.name} declares emergency`,
        body: `An in-flight system failure forced an emergency landing. No injuries, but the aircraft needs heavy repair.`,
        impact: `${target.name} reputation −8, ${plane.name} condition halved`,
      };
    },
  },
  // Reputation bounce for highest-cash airline
  {
    weight: 2,
    fire: (state) => {
      const sorted = [...state.players].sort((a, b) => b.cash - a.cash);
      const leader = sorted[0];
      leader.reputation = Math.min(100, leader.reputation + scaledDelta(4));
      return {
        id: nextId(), date: { ...state.date }, severity: 'good',
        headline: `${leader.name} named “Carrier of the Quarter”`,
        body: `Industry analysts highlight ${leader.name}'s strong financial performance this quarter.`,
        impact: `${leader.name} reputation +4`,
      };
    },
  },
];

const TOTAL_WEIGHT = BLUEPRINTS.reduce((s, b) => s + b.weight, 0);

/** Roll the dice each day; per-day event probability scales with difficulty.
 *  `settings.eventSeverity === 'off'` short-circuits to no event entirely. */
export function maybeRollEvent(): GameEvent | null {
  const state = GameState.get();
  if (state.settings.eventSeverity === 'off') return null;
  const cfg = getDifficulty(state.difficulty);
  if (Math.random() > cfg.eventChance) return null;
  let r = Math.random() * TOTAL_WEIGHT;
  for (const bp of BLUEPRINTS) {
    if (r < bp.weight) {
      const ev = bp.fire(state);
      if (ev) {
        state.gameEvents.unshift(ev);
        if (state.gameEvents.length > 200) state.gameEvents.length = 200;
        state.pushNews(`${ev.severity === 'bad' ? '⚠' : ev.severity === 'good' ? '✦' : '·'} ${ev.headline}`);
        sound.play('alert');
      }
      return ev;
    }
    r -= bp.weight;
  }
  return null;
}

export function registerEventHooks() {
  clock.onDay(() => maybeRollEvent());
}
