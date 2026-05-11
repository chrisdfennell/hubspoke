import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { getPlaneModel } from '../state/catalog';
import { getDifficulty } from '../state/Difficulty';
import { getCEO } from '../state/ceos';
import { clock } from './Clock';

/** Baseline annual loan interest rate (0.18 = 18%). Difficulty-scaled. */
export const LOAN_APR = 0.18;
/** Annual savings yield. Paid daily. */
export const SAVINGS_APY = 0.04;

/** Effective loan APR for the current run (after difficulty multiplier).
 *  Pass a player to also apply their CEO's loan-rate perk (Anita ×0.7).
 *  When called without a player it returns the un-personalized rate, which
 *  is what most read-only displays want. */
export function effectiveLoanApr(player?: Player): number {
  let apr = LOAN_APR * getDifficulty(GameState.get().difficulty).loanAprMult;
  const ceo = getCEO(player?.ceoId);
  if (ceo?.perks.loanAprMult) apr *= ceo.perks.loanAprMult;
  return apr;
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

/**
 * Pay off the player's loan using cash first, then dipping into savings if
 * cash isn't enough. Returns the amount actually paid. If the player has
 * neither cash nor savings, returns 0 and leaves state unchanged.
 *
 * Pairs with the Bank Scene's "Pay off in full" button so a player can
 * clear a $5M loan when they have $2M cash + $4M savings without manually
 * withdrawing first.
 */
export function payOffLoanCombined(p: Player): number {
  if (p.loan <= 0) return 0;
  let paid = 0;
  const fromCash = Math.min(p.cash, p.loan);
  if (fromCash > 0) {
    p.cash -= fromCash;
    p.loan -= fromCash;
    paid += fromCash;
  }
  if (p.loan > 0 && p.savings > 0) {
    const fromSavings = Math.min(p.savings, p.loan);
    p.savings -= fromSavings;
    p.loan -= fromSavings;
    paid += fromSavings;
  }
  return paid;
}

/**
 * Apply the human's auto-deposit / auto-withdraw rules. Called from the
 * daily hook alongside interest. AI rivals don't use these — the human
 * sets thresholds via the Bank's "Auto-rules" section.
 *
 * - autoSaveAboveCash > 0 moves any cash above the threshold into savings.
 * - autoWithdrawBelowCash > 0 withdraws from savings (up to its balance)
 *   to top cash back up toward the threshold.
 *
 * Skipped entirely when the loan is non-zero AND auto-rules would deposit
 * — paying loan interest from savings doesn't make sense, so keeping cash
 * available for the player to repay manually is the right default.
 */
export function applyAutoBank(p: Player): void {
  if (p.autoSaveAboveCash > 0 && p.cash > p.autoSaveAboveCash) {
    const excess = p.cash - p.autoSaveAboveCash;
    deposit(p, excess);
  }
  if (p.autoWithdrawBelowCash > 0 && p.cash < p.autoWithdrawBelowCash && p.savings > 0) {
    const needed = p.autoWithdrawBelowCash - p.cash;
    withdraw(p, Math.min(needed, p.savings));
  }
}

/** Daily interest tick — replaces the simpler one in Economy. APR is read
 *  per-player so CEO perks (Anita's 0.7× loan APR) actually save the human
 *  money on daily interest. */
export function applyDailyInterest() {
  const state = GameState.get();
  for (const p of state.players) {
    if (p.loan > 0) {
      const interest = p.loan * (effectiveLoanApr(p) / 360);
      p.cash -= interest;
    }
    if (p.savings > 0) {
      const yieldD = p.savings * (SAVINGS_APY / 360);
      p.savings += yieldD;
    }
  }
}

export function registerBankHooks() {
  clock.onDay(() => {
    applyDailyInterest();
    // Auto-rules run after interest so the post-interest cash position
    // is what the threshold compares against.
    applyAutoBank(GameState.get().human);
  });
}
