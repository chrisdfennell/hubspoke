import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { getPlaneModel } from '../state/catalog';
import { getDifficulty } from '../state/Difficulty';
import { clock } from './Clock';

/** Baseline annual loan interest rate (0.18 = 18%). Difficulty-scaled. */
export const LOAN_APR = 0.18;
/** Annual savings yield. Paid daily. */
export const SAVINGS_APY = 0.04;

/** Effective loan APR for the current run (after difficulty multiplier). */
export function effectiveLoanApr(): number {
  return LOAN_APR * getDifficulty(GameState.get().difficulty).loanAprMult;
}

/** A player's max loan = fleet value × 0.6 + $5M baseline. */
export function creditLimit(p: Player): number {
  const fleetValue = p.planes.reduce(
    (sum, plane) => sum + getPlaneModel(plane.modelId).price * plane.condition,
    0
  );
  return Math.round(5_000_000 + fleetValue * 0.6);
}

export function takeLoan(p: Player, amount: number): boolean {
  if (amount <= 0) return false;
  const ceiling = creditLimit(p);
  const newLoan = p.loan + amount;
  if (newLoan > ceiling) return false;
  p.loan = newLoan;
  p.cash += amount;
  return true;
}

export function repayLoan(p: Player, amount: number): boolean {
  if (amount <= 0) return false;
  const pay = Math.min(amount, p.loan, p.cash);
  if (pay <= 0) return false;
  p.loan -= pay;
  p.cash -= pay;
  return true;
}

export function deposit(p: Player, amount: number): boolean {
  if (amount <= 0) return false;
  if (p.cash < amount) return false;
  p.cash -= amount;
  p.savings += amount;
  return true;
}

export function withdraw(p: Player, amount: number): boolean {
  if (amount <= 0) return false;
  if (p.savings < amount) return false;
  p.savings -= amount;
  p.cash += amount;
  return true;
}

/** Daily interest tick — replaces the simpler one in Economy. */
export function applyDailyInterest() {
  const state = GameState.get();
  const apr = effectiveLoanApr();
  for (const p of state.players) {
    if (p.loan > 0) {
      const interest = p.loan * (apr / 360);
      p.cash -= interest;
    }
    if (p.savings > 0) {
      const yieldD = p.savings * (SAVINGS_APY / 360);
      p.savings += yieldD;
    }
  }
}

export function registerBankHooks() {
  clock.onDay(() => applyDailyInterest());
}
