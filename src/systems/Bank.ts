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

/** How much principal the human must pay on the first day of each month.
 *  Returns 0 on Easy (interest-only forever). */
export function monthlyPrincipalDue(p: Player): number {
  if (p.loan <= 0) return 0;
  const cfg = getDifficulty(GameState.get().difficulty);
  if (cfg.requiredPrincipalPct <= 0) return 0;
  const fromPct = p.loan * cfg.requiredPrincipalPct;
  return Math.round(Math.max(fromPct, cfg.requiredPrincipalMin));
}

/**
 * Charge the human's required monthly loan-principal payment. Called by the
 * daily hook when `state.date.day === 1` (first day of new month). Tries
 * cash first, then savings; any shortfall becomes a missed payment with a
 * cascade of consequences. Three consecutive missed months and creditors
 * seize the airline by setting `state.takenOverBy[human.id] = '_creditors_'`,
 * which HUDScene picks up and routes into the existing game-over flow.
 *
 * No-op on Easy difficulty (`requiredPrincipalPct === 0`) and when the
 * player has no outstanding loan.
 */
export function applyMonthlyLoanPayment(p: Player): void {
  const due = monthlyPrincipalDue(p);
  if (due <= 0) return;

  const state = GameState.get();

  // Try cash, then savings.
  let paid = 0;
  const fromCash = Math.min(p.cash, due);
  if (fromCash > 0) {
    p.cash -= fromCash;
    p.loan -= fromCash;
    paid += fromCash;
  }
  const remaining = due - paid;
  if (remaining > 0 && p.savings > 0) {
    const fromSavings = Math.min(p.savings, remaining);
    p.savings -= fromSavings;
    p.loan -= fromSavings;
    paid += fromSavings;
  }

  const shortfall = due - paid;
  if (shortfall <= 0) {
    // Paid in full — clear the missed counter.
    p.missedLoanPayments = 0;
    if (!p.isAI) {
      state.pushNews(`Monthly loan payment of ${formatMoneyShort(due)} paid in full.`);
    }
    return;
  }

  // Missed payment cascade. Late fee (5% of shortfall) gets added back to
  // the loan principal, plus a small reputation hit.
  const lateFee = Math.round(shortfall * 0.05);
  p.loan += lateFee;
  p.reputation = Math.max(0, p.reputation - 2);
  p.missedLoanPayments = (p.missedLoanPayments ?? 0) + 1;

  if (!p.isAI) {
    const remainingChances = Math.max(0, 3 - p.missedLoanPayments);
    const tail = remainingChances === 0
      ? ' Creditors are seizing the airline.'
      : `  ${remainingChances} missed payment${remainingChances === 1 ? '' : 's'} until creditors seize.`;
    state.pushNews(
      `⚠ Missed loan payment — short ${formatMoneyShort(shortfall)}. Late fee ${formatMoneyShort(lateFee)} added to principal.${tail}`,
    );
  }

  if (p.missedLoanPayments >= 3) {
    // Symmetric for AI now that AIs also take loans — three consecutive
    // missed payments and creditors seize the airline regardless of who
    // owns it. Routes through the same takenOverBy mechanism the human's
    // game-over flow already handles.
    state.takenOverBy[p.id] = '_creditors_';
    if (p.isAI) {
      state.pushNews(`★ Creditors have seized ${p.name} after 3 missed loan payments.`);
    }
  }
}

function formatMoneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
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
    const state = GameState.get();
    applyDailyInterest();
    // First day of a new month — the day-listener fires AFTER the month
    // rolled over, so date.day === 1 at this point exactly when a month
    // just ended. Applies to every active player so AI rivals also have
    // to service their loans (and can be creditor-seized if they don't).
    if (state.date.day === 1) {
      for (const p of state.players) {
        if (state.takenOverBy[p.id]) continue;
        applyMonthlyLoanPayment(p);
      }
    }
    // Auto-rules run last so the post-everything cash position is what
    // the thresholds compare against. Human-only — AI loan management
    // is in AI.aiManageLoans rather than auto-rules.
    applyAutoBank(state.human);
  });
}
