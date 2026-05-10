import { GameState, GameSnapshot, SAVE_VERSION } from '../state/GameState';
import { clock } from './Clock';

/**
 * Save system with multiple slots stored in localStorage.
 *
 * Keys:
 *   airline-tycoon-save-v2-slot-N    snapshot per slot id N (1..MAX_SLOTS)
 *   airline-tycoon-active-slot-v2    id of the slot last loaded/started; auto-save writes here
 *
 * Backwards compat: if a v1 single-save exists, migrate it into slot 1 on first read.
 */

export const MAX_SLOTS = 5;

const slotKey = (id: number) => `airline-tycoon-save-v2-slot-${id}`;
const ACTIVE_KEY = 'airline-tycoon-active-slot-v2';
const LEGACY_V1_KEY = 'airline-tycoon-save-v1';

/** Per-slot summary used by the title screen. */
export interface SlotInfo {
  id: number;
  empty: boolean;
  airlineName?: string;
  date?: string;
  cash?: number;
  realDateLabel?: string;
}

let activeSlotId: number | null = null;

function migrateLegacyIfPresent() {
  const legacy = localStorage.getItem(LEGACY_V1_KEY);
  if (!legacy) return;
  // Only migrate if slot 1 is empty (don't overwrite real saves).
  if (!localStorage.getItem(slotKey(1))) {
    try {
      // Re-stringify defensively (parse to validate).
      const parsed = JSON.parse(legacy);
      localStorage.setItem(slotKey(1), JSON.stringify(parsed));
    } catch {
      // ignore corrupt legacy save
    }
  }
  localStorage.removeItem(LEGACY_V1_KEY);
}

function readSlot(id: number): GameSnapshot | null {
  const raw = localStorage.getItem(slotKey(id));
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw) as GameSnapshot;
    if (snap.version !== SAVE_VERSION) {
      console.warn(`Slot ${id}: save version mismatch (got ${snap.version}, expected ${SAVE_VERSION}). Discarding.`);
      localStorage.removeItem(slotKey(id));
      return null;
    }
    return snap;
  } catch (e) {
    console.warn(`Slot ${id}: load failed:`, e);
    return null;
  }
}

export function listSlots(): SlotInfo[] {
  migrateLegacyIfPresent();
  const out: SlotInfo[] = [];
  for (let id = 1; id <= MAX_SLOTS; id++) {
    const snap = readSlot(id);
    if (!snap) {
      out.push({ id, empty: true });
      continue;
    }
    const human = snap.players[snap.humanIndex];
    const d = snap.date;
    const pad = (n: number) => n.toString().padStart(2, '0');
    out.push({
      id,
      empty: false,
      airlineName: human?.name ?? 'Unknown',
      date: `${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}`,
      cash: human?.cash ?? 0,
    });
  }
  return out;
}

export function hasAnySave(): boolean {
  migrateLegacyIfPresent();
  for (let id = 1; id <= MAX_SLOTS; id++) {
    if (localStorage.getItem(slotKey(id))) return true;
  }
  return false;
}

export function getActiveSlot(): number | null {
  if (activeSlotId !== null) return activeSlotId;
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= MAX_SLOTS ? n : null;
}

export function setActiveSlot(id: number) {
  activeSlotId = id;
  localStorage.setItem(ACTIVE_KEY, String(id));
}

export function clearActiveSlot() {
  activeSlotId = null;
  localStorage.removeItem(ACTIVE_KEY);
}

/** Save the current GameState into the given slot (or active slot if omitted). */
export function saveTo(id?: number): boolean {
  const slot = id ?? getActiveSlot();
  if (slot === null) return false;
  try {
    const json = JSON.stringify(GameState.get().toJSON());
    localStorage.setItem(slotKey(slot), json);
    return true;
  } catch (e) {
    console.warn('Save failed:', e);
    return false;
  }
}

/** Save into the active slot. No-op if no active slot. */
export function saveNow(): boolean {
  return saveTo();
}

/** Load a slot into GameState. Sets it as the active slot on success. */
export function loadSlot(id: number): boolean {
  const snap = readSlot(id);
  if (!snap) return false;
  GameState.loadFrom(snap);
  setActiveSlot(id);
  return true;
}

export function deleteSlot(id: number): boolean {
  const had = !!localStorage.getItem(slotKey(id));
  localStorage.removeItem(slotKey(id));
  if (getActiveSlot() === id) clearActiveSlot();
  return had;
}

export function findEmptySlot(): number | null {
  for (let id = 1; id <= MAX_SLOTS; id++) {
    if (!localStorage.getItem(slotKey(id))) return id;
  }
  return null;
}

let autoSaveRegistered = false;

/**
 * Auto-save. Cadence is read live from `settings.autosaveCadence` each tick
 * — flipping it in the Settings panel takes effect immediately, no reload.
 *   - 'hour'   → write to the active slot on every in-game hour boundary
 *   - 'day'    → write on every in-game day boundary
 *   - 'manual' → no clock-driven saves; player uses the in-app Save button
 * Browser-close save is gated by `settings.saveOnClose` (default true).
 */
export function registerAutoSave() {
  if (autoSaveRegistered) return;
  autoSaveRegistered = true;

  // Register both hour and day hooks; the live cadence setting decides which
  // one actually fires saveNow(). Doing it this way means no lifecycle dance
  // when the player flips the setting.
  clock.onHour(() => {
    if (GameState.get().settings.autosaveCadence === 'hour') saveNow();
  });
  clock.onDay(() => {
    if (GameState.get().settings.autosaveCadence === 'day') saveNow();
  });
  const onClose = () => {
    if (GameState.get().settings.saveOnClose) saveNow();
  };
  window.addEventListener('beforeunload', onClose);
  window.addEventListener('pagehide', onClose);
}
