import { GameState, GameDate } from '../state/GameState';
import { CITIES, getCity } from '../state/catalog';
import { getFuelPrice, setFuelPrice } from './Economy';
import { applyDemandMod } from '../state/demandModifiers';
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

let eventCounter = 1;
const nextId = () => `e${eventCounter++}`;

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
      for (const id of PACIFIC_CITY_IDS) applyDemandMod(id, 0.5, 5, state.date);
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
      ['ito', 'koa'].forEach(id => applyDemandMod(id, 0.3, 5, state.date));
      return {
        id: nextId(), date: { ...state.date }, severity: 'bad',
        headline: 'Mauna Loa erupts — airspace closures',
        body: `Volcanic ash plumes have grounded several inter-island flights to Hilo and Kona.`,
        impact: 'Hilo & Kona demand −70% for 5 days',
      };
    },
  },
  // Tourism boom
  {
    weight: 6,
    fire: (state) => {
      const dest = CITIES[Math.floor(Math.random() * CITIES.length)];
      applyDemandMod(dest.id, 1.5, 7, state.date);
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
      for (const p of state.players) p.reputation = Math.max(0, p.reputation - 5);
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
      applyDemandMod('hnl', 1.3, 3, state.date);
      for (const p of state.players) p.reputation = Math.min(100, p.reputation + 2);
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
      for (const id of INTERCONTINENTAL_IDS) applyDemandMod(id, 1.10, 14, state.date);
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
      target.reputation = Math.max(0, target.reputation - 12);
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
      target.reputation = Math.max(0, target.reputation - 8);
      // Damage one of their planes badly.
      const plane = target.planes[Math.floor(Math.random() * target.planes.length)];
      plane.condition = Math.max(0.1, plane.condition * 0.5);
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
      leader.reputation = Math.min(100, leader.reputation + 4);
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

/** Roll the dice each day; per-day event probability scales with difficulty. */
export function maybeRollEvent(): GameEvent | null {
  const state = GameState.get();
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
