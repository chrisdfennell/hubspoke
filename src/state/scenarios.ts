/**
 * Campaign mode — scripted scenarios with custom starting conditions
 * and win/lose criteria. Each scenario layers on top of the normal
 * game systems: the world simulates as usual, but the player has a
 * specific objective list to satisfy before a deadline. Failing the
 * deadline (or going bankrupt) ends the run; satisfying all
 * objectives wins it.
 *
 * Sandbox-style victory ($1B net worth, all rivals eliminated) is
 * suppressed when a scenario is active so the run only resolves on
 * the scenario's own terms.
 */

import { GameState } from './GameState';
import { netWorth } from '../systems/Milestones';
import { Difficulty } from './Difficulty';
import { getFloat } from '../systems/Stocks';

export interface ScenarioObjective {
  id: string;
  /** Player-facing label, rendered in the mission HUD. */
  label: string;
  /** Current value pulled from live state. */
  progress(state: GameState): number;
  /** Win threshold — objective complete when `progress >= target`. */
  target: number;
  /** How to format the value in the HUD. */
  valueKind?: 'count' | 'money';
}

export interface Scenario {
  id: string;
  name: string;
  /** One-paragraph briefing shown in the picker + on game-over. */
  description: string;
  /** Emoji shown in the picker card. */
  icon: string;
  /** Underlying difficulty preset — sets cash, crew, AI behaviors, etc. */
  difficulty: Difficulty;
  /** City id the player is based out of. AI rivals still randomize. */
  hub: string;
  /** Optional CEO id (defaults to Mario's perks if unset). */
  ceoId?: string;
  /** Override starting cash for the human player only. AI rivals still
   *  get the difficulty preset's startCash. Use this when the scenario's
   *  win condition is a money target that the difficulty's default cash
   *  would already satisfy (e.g. First Million on Easy starts at $25M). */
  startCashOverride?: number;
  /** Days to complete all objectives before the run fails. */
  deadlineDays: number;
  /** Win when every objective's progress >= target. */
  objectives: ScenarioObjective[];
}

/** Built-in scenario library. Ordered roughly by difficulty. */
export const SCENARIOS: Scenario[] = [
  {
    id: 'first-million',
    name: 'First Million',
    icon: '💰',
    description:
      'A simple goal: grow your starting capital. Hawaii is small but profitable — fly inter-island routes, manage your fuel, and you can hit a million net worth in two months.',
    difficulty: 'easy',
    hub: 'hnl',
    startCashOverride: 250_000,
    deadlineDays: 60,
    objectives: [
      {
        id: 'nw-1m',
        label: 'Reach $1,000,000 net worth',
        target: 1_000_000,
        valueKind: 'money',
        progress: s => netWorth(s.human),
      },
    ],
  },
  {
    id: 'cargo-king',
    name: 'Cargo King',
    icon: '📦',
    description:
      'Build a freight-first operation. Stack cargo contracts off the board, run them with whatever fleet fits, and hit 30 deliveries before the year is out. New York is the staging ground.',
    difficulty: 'normal',
    hub: 'jfk',
    deadlineDays: 180,
    objectives: [
      {
        id: 'cargo-30',
        label: 'Deliver 30 cargo contracts',
        target: 30,
        progress: s => s.stats.cargoDeliveries,
      },
      {
        id: 'kg-200k',
        label: 'Ship 200,000 kg lifetime',
        target: 200_000,
        progress: s => s.stats.cargoKgShipped,
      },
    ],
  },
  {
    id: 'empire-builder',
    name: 'Empire Builder',
    icon: '🌐',
    description:
      'Five routes, ten planes, fifty million dollars net worth. Build the airline from a single Cessna at LAX into a real operator inside one year.',
    difficulty: 'normal',
    hub: 'lax',
    deadlineDays: 360,
    objectives: [
      {
        id: 'routes-5',
        label: 'Operate 5 routes',
        target: 5,
        progress: s => s.human.routes.length,
      },
      {
        id: 'planes-10',
        label: 'Fleet of 10 planes',
        target: 10,
        progress: s => s.human.planes.length,
      },
      {
        id: 'nw-50m',
        label: 'Reach $50M net worth',
        target: 50_000_000,
        valueKind: 'money',
        progress: s => netWorth(s.human),
      },
    ],
  },
  {
    id: 'globetrotter',
    name: 'Globetrotter',
    icon: '🌍',
    description:
      'Open hubs on four continents within a year. Starting at Heathrow with serious capital — you have the cash, just need the speed and the planes that can reach.',
    difficulty: 'normal',
    hub: 'lhr',
    deadlineDays: 360,
    objectives: [
      {
        id: 'hubs-4',
        label: 'Open 4 hubs',
        target: 4,
        progress: s => s.human.hubs.length,
      },
      {
        id: 'routes-15',
        label: 'Operate 15 routes',
        target: 15,
        progress: s => s.human.routes.length,
      },
    ],
  },
  {
    id: 'hostile-takeover',
    name: 'Hostile Takeover',
    icon: '☠',
    description:
      'Acquire majority ownership in Falcon Lines before the year is out. You will need cash, patience, and to push their share price down with savvy timing. Brutal AI rivals do not make this easy.',
    difficulty: 'hard',
    hub: 'jfk',
    deadlineDays: 360,
    objectives: [
      {
        id: 'falcon-majority',
        label: 'Hold 500,000+ Falcon Lines shares',
        target: 500_000,
        progress: s => s.human.holdings['falcon'] ?? 0,
      },
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find(s => s.id === id);
}

/** Active scenario for the current run, or null if it's a sandbox game. */
export function getActiveScenario(state: GameState): Scenario | null {
  if (!state.scenarioId) return null;
  return getScenario(state.scenarioId) ?? null;
}

export interface ScenarioProgress {
  scenario: Scenario;
  objectives: Array<{ obj: ScenarioObjective; value: number; complete: boolean }>;
  allComplete: boolean;
  daysElapsed: number;
  daysRemaining: number;
  deadlinePassed: boolean;
}

/** Live evaluation of every objective + the scenario deadline. Read by
 *  the mission HUD overlay and by checkGameOver to decide win/lose. */
export function evaluateScenario(state: GameState): ScenarioProgress | null {
  const scenario = getActiveScenario(state);
  if (!scenario) return null;
  const today = stateDay(state);
  const startedOn = state.scenarioStartDay ?? today;
  const daysElapsed = Math.max(0, today - startedOn);
  const daysRemaining = scenario.deadlineDays - daysElapsed;
  const objectives = scenario.objectives.map(obj => {
    const value = obj.progress(state);
    return { obj, value, complete: value >= obj.target };
  });
  const allComplete = objectives.every(o => o.complete);
  return {
    scenario,
    objectives,
    allComplete,
    daysElapsed,
    daysRemaining,
    deadlinePassed: daysRemaining <= 0,
  };
}

/** Day-index helper — same shape as dateToDay in demandModifiers, kept
 *  local here so this file's runtime deps stay small. */
function stateDay(state: GameState): number {
  const d = state.date;
  return d.year * 12 * 30 + (d.month - 1) * 30 + (d.day - 1);
}

export function getScenarioStartDay(state: GameState): number {
  return state.scenarioStartDay ?? stateDay(state);
}
