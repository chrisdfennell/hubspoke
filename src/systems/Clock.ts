import { GameState } from '../state/GameState';
import { MS_PER_GAME_MINUTE } from '../config';

type TickListener = (state: GameState) => void;

export class Clock {
  private accumMs = 0;
  private listeners: TickListener[] = [];
  /** Listeners that fire only on hour boundaries. */
  private hourListeners: TickListener[] = [];
  /** Listeners that fire only on day boundaries. */
  private dayListeners: TickListener[] = [];

  onTick(fn: TickListener) { this.listeners.push(fn); }
  onHour(fn: TickListener) { this.hourListeners.push(fn); }
  onDay(fn: TickListener)  { this.dayListeners.push(fn); }

  /** Drive from Phaser's update(time, delta) loop. */
  update(deltaMs: number) {
    const state = GameState.get();
    if (state.paused) return;

    this.accumMs += deltaMs * state.speed;
    while (this.accumMs >= MS_PER_GAME_MINUTE) {
      this.accumMs -= MS_PER_GAME_MINUTE;
      this.advanceOneMinute(state);
    }
  }

  private advanceOneMinute(state: GameState) {
    const d = state.date;
    d.minute += 1;
    let hourTicked = false;
    let dayTicked = false;
    if (d.minute >= 60) {
      d.minute = 0;
      d.hour += 1;
      hourTicked = true;
    }
    if (d.hour >= 24) {
      d.hour = 0;
      d.day += 1;
      dayTicked = true;
    }
    if (d.day > 30) { // simplified 30-day months
      d.day = 1;
      d.month += 1;
    }
    if (d.month > 12) {
      d.month = 1;
      d.year += 1;
    }

    for (const fn of this.listeners) fn(state);
    if (hourTicked) for (const fn of this.hourListeners) fn(state);
    if (dayTicked)  for (const fn of this.dayListeners) fn(state);
  }
}

export const clock = new Clock();

export function formatDate(d: { year: number; month: number; day: number; hour: number; minute: number }): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.year}-${pad(d.month)}-${pad(d.day)}  ${pad(d.hour)}:${pad(d.minute)}`;
}

export function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return `${sign}$${abs.toLocaleString('en-US')}`;
}
