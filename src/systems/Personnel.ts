import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { clock } from './Clock';

/** Morale baseline new airlines start at — "decent but not great." */
export const MORALE_BASELINE = 70;
/** Recovery rate per day when crew is well-rested (utilization < 0.5). */
export const MORALE_REST_GAIN = 2;
/** Hit per day when overworked (utilization > 1.0). */
export const MORALE_OVERWORK_HIT = 1;
/** Severe-overwork hit (utilization > 1.5). */
export const MORALE_SEVERE_HIT = 3;
/** Morale floor below which crew start quitting (daily roll). */
export const MORALE_QUIT_THRESHOLD = 30;
/** Per-day chance of a resignation when morale is below the threshold. */
export const MORALE_QUIT_CHANCE = 0.10;
/** Bump applied to morale every time the player hires a new crew member. */
export const MORALE_HIRE_BUMP = 2;
/** Drop applied to morale on a crash (per crash). */
export const MORALE_CRASH_HIT = 10;
/** Drop applied to morale on an incident (per incident). */
export const MORALE_INCIDENT_HIT = 3;

/** Daily salary per crew member. */
export const PILOT_SALARY = 600;
export const MECHANIC_SALARY = 350;

/** Hire cost (one-time). */
export const PILOT_HIRE_COST = 8_000;
export const MECHANIC_HIRE_COST = 4_000;

/** Each plane requires 1 pilot + 1 mechanic to fly. */
export function maxPlanesStaffed(p: Player): number {
  return Math.min(p.pilots, p.mechanics);
}

/** A player's planes that should be grounded due to insufficient staff. */
export function staffShortfall(p: Player): number {
  const need = p.planes.length;
  return Math.max(0, need - maxPlanesStaffed(p));
}

export function hirePilot(p: Player): boolean {
  if (p.cash < PILOT_HIRE_COST) return false;
  p.cash -= PILOT_HIRE_COST;
  p.pilots += 1;
  p.morale = Math.min(100, p.morale + MORALE_HIRE_BUMP);
  return true;
}

export function firePilot(p: Player): boolean {
  if (p.pilots <= 0) return false;
  p.pilots -= 1;
  return true;
}

export function hireMechanic(p: Player): boolean {
  if (p.cash < MECHANIC_HIRE_COST) return false;
  p.cash -= MECHANIC_HIRE_COST;
  p.mechanics += 1;
  p.morale = Math.min(100, p.morale + MORALE_HIRE_BUMP);
  return true;
}

export function fireMechanic(p: Player): boolean {
  if (p.mechanics <= 0) return false;
  p.mechanics -= 1;
  return true;
}

/** Daily payroll. */
export function applyDailyPayroll() {
  const state = GameState.get();
  for (const p of state.players) {
    p.cash -= p.pilots * PILOT_SALARY;
    p.cash -= p.mechanics * MECHANIC_SALARY;
  }
}

/**
 * Crew utilization: how many planes are actively assigned to routes per
 * pilot. >1.0 means "more flying happening than pilots can comfortably
 * cover"; <0.5 means "crew is mostly grounded, can rest." Returns 0
 * for players with no pilots (avoid divide-by-zero — no pilots is its
 * own crisis flagged by `staffShortfall`).
 */
export function crewUtilization(p: Player): number {
  if (p.pilots <= 0) return 0;
  const active = p.planes.filter(pl => pl.routeId !== null).length;
  return active / p.pilots;
}

/**
 * Daily crew morale update. Utilization drives the natural delta:
 * overworked drops morale, rested recovers it. When morale is in the
 * red zone, crew can quit (random pilot or mechanic leaves, morale
 * jumps up because the remaining crew is now less overworked).
 *
 * Symmetric — applies to AI rivals too, so they hit the same overwork
 * / mishap feedback loops the human does.
 */
export function applyDailyMorale() {
  const state = GameState.get();
  for (const p of state.players) {
    if (state.takenOverBy[p.id]) continue;
    const u = crewUtilization(p);
    let delta = 0;
    if (u > 1.5) delta -= MORALE_SEVERE_HIT;
    else if (u > 1.0) delta -= MORALE_OVERWORK_HIT;
    else if (u < 0.5) delta += MORALE_REST_GAIN;
    // No-op in the balanced band (0.5..1.0) — small natural neutral zone.
    p.morale = Math.max(0, Math.min(100, p.morale + delta));

    // Resignation: when morale is critically low a crew member packs up
    // and leaves. Removing them eases the remaining crew's load, so
    // morale ticks back up — captures the "things have to get worse
    // before they get better" feeling without spiralling to zero.
    if (p.morale < MORALE_QUIT_THRESHOLD && Math.random() < MORALE_QUIT_CHANCE) {
      // Bias toward whichever role has more headcount so we don't strand
      // a fleet by always taking the last pilot first.
      const cutPilot = p.pilots > p.mechanics && p.pilots > 0;
      if (cutPilot) {
        p.pilots -= 1;
        if (!p.isAI) state.pushNews(`⚠ A pilot resigned from ${p.name}. Morale was ${Math.round(p.morale)}.`);
      } else if (p.mechanics > 0) {
        p.mechanics -= 1;
        if (!p.isAI) state.pushNews(`⚠ A mechanic resigned from ${p.name}. Morale was ${Math.round(p.morale)}.`);
      }
      p.morale = Math.min(100, p.morale + 10);
    }
  }
}

/** Verbal band label for a given morale value — used in the Personnel
 *  scene and any tooltip that surfaces "how the crew feels right now." */
export function moraleLabel(morale: number): { label: string; color: string } {
  if (morale >= 80) return { label: 'Energized',   color: '#7be08a' };
  if (morale >= 60) return { label: 'Content',     color: '#caa46a' };
  if (morale >= 40) return { label: 'Strained',    color: '#ffb360' };
  if (morale >= 20) return { label: 'Burned out',  color: '#ff9aa6' };
  return                   { label: 'In revolt',   color: '#ff7b88' };
}

/** Multiplier applied to flight load-factor based on crew morale —
 *  small at the edges (±3%) so morale never dominates routing decisions
 *  but still rewards a well-rested crew and punishes overwork. Read by
 *  Economy.flightProfit per-route via the route's owner. */
export function moraleLoadFactorMult(morale: number): number {
  if (morale >= 80) return 1.03;
  if (morale <= 40) return 0.97;
  return 1.0;
}

/** Multiplier applied to maybeMishap's failChance — overworked crew
 *  miss small problems that compound into mid-flight failures. Returns
 *  1.0 above 50 morale; ramps to 1.5 at morale 0. */
export function moraleMishapMult(morale: number): number {
  if (morale >= 50) return 1.0;
  return 1.0 + (50 - morale) / 100;
}

export function registerPersonnelHooks() {
  clock.onDay(() => {
    applyDailyPayroll();
    applyDailyMorale();
  });
}
