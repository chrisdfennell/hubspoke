import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { clock } from './Clock';

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

export function registerPersonnelHooks() {
  clock.onDay(() => applyDailyPayroll());
}
