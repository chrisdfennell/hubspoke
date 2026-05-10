/**
 * Per-city demand modifiers, mutated by events. Looked up by Economy when
 * computing suggested ticket prices and load factors. Default is 1.0.
 */

const modifiers: Record<string, { mult: number; expiresOn: number }[]> = {};

/** Convert a date object to a sortable day-count. */
export function dateToDay(d: { year: number; month: number; day: number }): number {
  return d.year * 12 * 30 + (d.month - 1) * 30 + (d.day - 1);
}

export function applyDemandMod(cityId: string, mult: number, durationDays: number, currentDate: { year: number; month: number; day: number }) {
  if (!modifiers[cityId]) modifiers[cityId] = [];
  modifiers[cityId].push({ mult, expiresOn: dateToDay(currentDate) + durationDays });
}

export function getDemandMult(cityId: string, currentDate: { year: number; month: number; day: number }): number {
  const today = dateToDay(currentDate);
  const list = modifiers[cityId];
  if (!list) return 1;
  // Drop expired in-place.
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].expiresOn < today) list.splice(i, 1);
  }
  if (list.length === 0) return 1;
  return list.reduce((acc, m) => acc * m.mult, 1);
}

export function clearAllModifiers() {
  for (const key of Object.keys(modifiers)) delete modifiers[key];
}

/** Snapshot active modifiers for save/load. */
export function snapshotModifiers(): Record<string, { mult: number; expiresOn: number }[]> {
  const out: Record<string, { mult: number; expiresOn: number }[]> = {};
  for (const k of Object.keys(modifiers)) out[k] = modifiers[k].map(m => ({ ...m }));
  return out;
}

export function restoreModifiers(data: Record<string, { mult: number; expiresOn: number }[]> | undefined) {
  clearAllModifiers();
  if (!data) return;
  for (const k of Object.keys(data)) modifiers[k] = data[k].map(m => ({ ...m }));
}
