import { GameState } from '../state/GameState';

const STORAGE_KEY = 'hub-and-spoke-tutorial-seen';

export interface TutorialStep {
  id: string;
  text: string;
  /** Returns true when this step's goal has been achieved. The HUD's
   *  per-tick poll advances to the next step (or finishes) when true. */
  isComplete(): boolean;
}

/**
 * Three-step onboarding for a fresh run: buy a plane → open a route →
 * watch the first flight. Each step's `isComplete` reads live state, so
 * the banner auto-advances when the player does the prescribed thing
 * (or anything else that satisfies the same goal — e.g., loading a save
 * that already has planes).
 */
export const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    text: 'Welcome to Hub & Spoke! Click WORKSHOP (top row) to buy your first plane.',
    isComplete: () => GameState.get().human.planes.length > 0,
  },
  {
    id: 'route',
    text: 'Plane bought! Now click TRAVEL AGENCY to open a route from your hub.',
    isComplete: () => GameState.get().human.routes.length > 0,
  },
  {
    id: 'dispatch',
    text: 'Route opened. Your plane will dispatch automatically — watch the apron strip at the bottom for the takeoff!',
    isComplete: () => GameState.get().stats.flights > 0,
  },
];

export function tutorialDismissed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

/** Mark the tutorial as seen for this browser. Either fired by the
 *  player hitting Skip, by completing the final step, or auto on
 *  BootScene.go() when a loaded save is already past the goalposts. */
export function dismissTutorial(): void {
  localStorage.setItem(STORAGE_KEY, '1');
}

/** If the human has any flights already, skip the tutorial — happens when
 *  resuming a partially-developed save. Called once from BootScene.go(). */
export function maybeAutoDismissForLoadedSave(): void {
  if (tutorialDismissed()) return;
  if (GameState.get().stats.flights > 0) dismissTutorial();
}
