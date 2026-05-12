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

// ============================================================
// Export / Import — survive a localStorage clear by downloading
// slot JSON to a file, and read it back via a file picker.
// ============================================================

const EXPORT_FORMAT_SLOT = 'hubspoke-save-v1';
const EXPORT_FORMAT_BACKUP = 'hubspoke-backup-v1';

interface SlotExport {
  format: typeof EXPORT_FORMAT_SLOT;
  exportedAt: string;
  saveVersion: number;
  snapshot: GameSnapshot;
}

interface BackupExport {
  format: typeof EXPORT_FORMAT_BACKUP;
  exportedAt: string;
  saveVersion: number;
  slots: Record<string, GameSnapshot>;
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  /** For backup imports: number of slots written. */
  count?: number;
}

/** Build the export-JSON string for a slot, or null if the slot is empty. */
export function exportSlotJson(id: number): string | null {
  const snap = readSlot(id);
  if (!snap) return null;
  const payload: SlotExport = {
    format: EXPORT_FORMAT_SLOT,
    exportedAt: new Date().toISOString(),
    saveVersion: SAVE_VERSION,
    snapshot: snap,
  };
  return JSON.stringify(payload, null, 2);
}

/** Build the export-JSON string for all filled slots. */
export function exportAllSlotsJson(): string {
  const slots: Record<string, GameSnapshot> = {};
  for (let id = 1; id <= MAX_SLOTS; id++) {
    const snap = readSlot(id);
    if (snap) slots[String(id)] = snap;
  }
  const payload: BackupExport = {
    format: EXPORT_FORMAT_BACKUP,
    exportedAt: new Date().toISOString(),
    saveVersion: SAVE_VERSION,
    slots,
  };
  return JSON.stringify(payload, null, 2);
}

/** Suggested filename for a single-slot export, based on airline + in-game date. */
export function suggestSlotFilename(id: number): string {
  const snap = readSlot(id);
  if (!snap) return `hubspoke-slot${id}.json`;
  const airline = (snap.players[snap.humanIndex]?.name ?? 'airline')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const d = snap.date;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `hubspoke-slot${id}-${airline}-${d.year}${pad(d.month)}${pad(d.day)}.json`;
}

export function suggestBackupFilename(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `hubspoke-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
}

/** Trigger a browser file download with the given JSON content. */
export function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Slight delay before revoking — some browsers race the click handler.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a file picker and resolve the chosen file's text content. Rejects on
 *  cancel or read error. Uses a transient <input type=file> appended to the
 *  body and removed after the change event fires. */
export function pickJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    // Some browsers fire neither change nor cancel when the picker is
    // dismissed — wire a focus fallback to reject after a short delay.
    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) {
        settled = true;
        cleanup();
        reject(new Error('No file chosen'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        settled = true;
        cleanup();
        resolve(String(reader.result ?? ''));
      };
      reader.onerror = () => {
        settled = true;
        cleanup();
        reject(reader.error ?? new Error('Read error'));
      };
      reader.readAsText(f);
    });
    window.addEventListener('focus', () => {
      setTimeout(() => {
        if (!settled) {
          cleanup();
          reject(new Error('Picker dismissed'));
        }
      }, 400);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Parse a single-slot export JSON and write it to the given slot id.
 *  Validates format + save version before touching storage. */
export function importSlotJson(id: number, raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'File contents are not a save object.' };
  }
  const obj = parsed as Partial<SlotExport> & { snapshot?: GameSnapshot };
  if (obj.format !== EXPORT_FORMAT_SLOT) {
    return { ok: false, error: `Unrecognized file format "${obj.format ?? 'unknown'}". Expected a single-slot Hub & Spoke save.` };
  }
  if (obj.saveVersion !== SAVE_VERSION) {
    return { ok: false, error: `Save version mismatch (file: ${obj.saveVersion}, current: ${SAVE_VERSION}). This save is from a different game build and cannot be imported.` };
  }
  const snap = obj.snapshot;
  if (!snap || typeof snap !== 'object' || !Array.isArray(snap.players)) {
    return { ok: false, error: 'Save snapshot is missing or malformed.' };
  }
  try {
    localStorage.setItem(slotKey(id), JSON.stringify(snap));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Browser refused to write the save (storage full?).' };
  }
}

/** Parse a multi-slot backup JSON and write each contained slot into its
 *  matching slot id. Overwrites existing data in those slots. */
export function importAllSlotsJson(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'File contents are not a backup object.' };
  }
  const obj = parsed as Partial<BackupExport>;
  if (obj.format !== EXPORT_FORMAT_BACKUP) {
    return { ok: false, error: `Unrecognized file format "${obj.format ?? 'unknown'}". Expected a multi-slot Hub & Spoke backup.` };
  }
  if (obj.saveVersion !== SAVE_VERSION) {
    return { ok: false, error: `Save version mismatch (file: ${obj.saveVersion}, current: ${SAVE_VERSION}). This backup is from a different game build and cannot be imported.` };
  }
  if (!obj.slots || typeof obj.slots !== 'object') {
    return { ok: false, error: 'Backup contains no slot data.' };
  }
  let count = 0;
  try {
    for (const [idStr, snap] of Object.entries(obj.slots)) {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id) || id < 1 || id > MAX_SLOTS) continue;
      if (!snap || typeof snap !== 'object' || !Array.isArray((snap as GameSnapshot).players)) continue;
      localStorage.setItem(slotKey(id), JSON.stringify(snap));
      count++;
    }
  } catch (e) {
    return { ok: false, error: 'Browser refused to write the save (storage full?).' };
  }
  if (count === 0) {
    return { ok: false, error: 'Backup contained no valid slots.' };
  }
  return { ok: true, count };
}

/** Inspect a backup file without writing — used to populate the confirm
 *  dialog before overwriting existing slots. */
export interface BackupSummary {
  count: number;
  slotIds: number[];
}
export function summarizeBackup(raw: string): BackupSummary | { error: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { error: 'File is not valid JSON.' }; }
  if (!parsed || typeof parsed !== 'object') return { error: 'File contents are not a backup object.' };
  const obj = parsed as Partial<BackupExport>;
  if (obj.format !== EXPORT_FORMAT_BACKUP) return { error: `Unrecognized file format "${obj.format ?? 'unknown'}".` };
  if (obj.saveVersion !== SAVE_VERSION) return { error: `Save version mismatch (file: ${obj.saveVersion}, current: ${SAVE_VERSION}).` };
  if (!obj.slots) return { error: 'Backup contains no slot data.' };
  const ids: number[] = [];
  for (const idStr of Object.keys(obj.slots)) {
    const id = parseInt(idStr, 10);
    if (Number.isFinite(id) && id >= 1 && id <= MAX_SLOTS) ids.push(id);
  }
  ids.sort((a, b) => a - b);
  return { count: ids.length, slotIds: ids };
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
