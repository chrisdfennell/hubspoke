/**
 * Per-city weather-hazard multipliers — parallel to demandModifiers but
 * applied to mishap chance on landing rather than to load factor. A
 * thunderstorm at JFK doesn't just sap demand for tickets there; it
 * also makes a marginal plane more likely to declare an emergency on
 * approach. Default multiplier is 1.0 (clear weather, no effect).
 *
 * Read by Flights.maybeMishap, written by Events.ts blueprints when a
 * weather event fires.
 */

import { dateToDay } from './demandModifiers';

const hazards: Record<string, { mult: number; expiresOn: number }[]> = {};

/** Stack a new hazard multiplier on `cityId` for `durationDays`. The
 *  effective multiplier is the product of every active hazard on the
 *  city, so a thunderstorm during an already-elevated hurricane day
 *  compounds (rare but technically possible). */
export function applyWeatherHazard(
  cityId: string,
  mult: number,
  durationDays: number,
  currentDate: { year: number; month: number; day: number },
) {
  if (!hazards[cityId]) hazards[cityId] = [];
  hazards[cityId].push({ mult, expiresOn: dateToDay(currentDate) + durationDays });
}

/** Effective mishap-chance multiplier for `cityId` given the current
 *  date. Returns 1.0 when no hazards are active (clear weather). Side
 *  effect: prunes expired entries. */
export function getHazardMult(
  cityId: string,
  currentDate: { year: number; month: number; day: number },
): number {
  const today = dateToDay(currentDate);
  const list = hazards[cityId];
  if (!list) return 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].expiresOn < today) list.splice(i, 1);
  }
  if (list.length === 0) return 1;
  return list.reduce((acc, h) => acc * h.mult, 1);
}

export function clearAllHazards() {
  for (const key of Object.keys(hazards)) delete hazards[key];
}

/** Snapshot active hazards for save/load. */
export function snapshotHazards(): Record<string, { mult: number; expiresOn: number }[]> {
  const out: Record<string, { mult: number; expiresOn: number }[]> = {};
  for (const k of Object.keys(hazards)) out[k] = hazards[k].map(h => ({ ...h }));
  return out;
}

export function restoreHazards(data: Record<string, { mult: number; expiresOn: number }[]> | undefined) {
  clearAllHazards();
  if (!data) return;
  for (const k of Object.keys(data)) hazards[k] = data[k].map(h => ({ ...h }));
}
