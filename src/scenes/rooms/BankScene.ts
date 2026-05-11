import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import {
  creditLimit, takeLoan, repayLoan, deposit, withdraw,
  effectiveLoanApr, SAVINGS_APY, payOffLoanCombined, monthlyPrincipalDue,
} from '../../systems/Bank';

export class BankScene extends RoomScene {
  constructor() { super('BankScene'); this.title = 'Bank — Loans & Savings'; }

  buildRoom() {
    const me = GameState.get().human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y, `Cash on hand: ${formatMoney(me.cash)}`, 16, me.cash < 0 ? '#ff7b88' : COLORS.accentText);
    y += 30;

    // ---- Loans ----
    this.addText(left, y, 'Loans', 18, COLORS.accentText);
    y += 28;
    this.addText(left, y, `Outstanding loan: ${formatMoney(me.loan)}`, 14);
    y += 22;
    this.addText(left, y, `Credit limit: ${formatMoney(creditLimit(me))}    APR: ${(effectiveLoanApr(me) * 100).toFixed(1)}%`, 13, COLORS.textDim);
    y += 22;

    // Monthly obligation — Easy is interest-only so 0; other tiers require a
    // principal payment on the 1st of every month. Surfaced here so the
    // player can see what's coming + whether they're at risk of a missed
    // payment cascade.
    const monthlyDue = monthlyPrincipalDue(me);
    if (monthlyDue > 0) {
      const missed = me.missedLoanPayments;
      const missedText = missed > 0
        ? `   ⚠ ${missed} missed (${3 - missed} until creditors seize)`
        : '';
      const color = missed > 0 ? '#ff7b88' : COLORS.textDim;
      this.addText(left, y,
        `Monthly principal due: ${formatMoney(monthlyDue)} (1st of each month)${missedText}`,
        13, color);
      y += 22;
    } else if (me.loan > 0) {
      this.addText(left, y, 'Monthly principal due: — (interest only on this difficulty)', 13, COLORS.textDim);
      y += 22;
    }
    y += 8;

    this.addText(left, y, 'Borrow:', 13, COLORS.textDim);
    const amounts = [100_000, 500_000, 1_000_000, 5_000_000];
    let bx = left + 70;
    for (const amt of amounts) {
      const ok = me.loan + amt <= creditLimit(me);
      const btn = new Button({
        scene: this, x: bx + 60, y: y + 12, width: 110, height: 26,
        label: `+${formatMoney(amt)}`,
        disabled: !ok,
        onClick: () => {
          if (takeLoan(me, amt)) {
            GameState.get().pushNews(`${me.name} took a ${formatMoney(amt)} loan.`);
            this.rebuild();
          }
        },
      });
      this.content.add(btn);
      bx += 120;
    }

    y += 38;
    this.addText(left, y, 'Repay:', 13, COLORS.textDim);
    bx = left + 70;
    const repayAmts = [100_000, 500_000, 1_000_000, me.loan];
    const repayLabels = ['$100K', '$500K', '$1M', 'Cash All'];
    for (let i = 0; i < repayAmts.length; i++) {
      const amt = repayAmts[i];
      const ok = me.loan > 0 && me.cash > 0 && (i < 3 ? me.cash >= amt : true) && amt > 0;
      const btn = new Button({
        scene: this, x: bx + 60, y: y + 12, width: 110, height: 26,
        label: `−${repayLabels[i]}`,
        disabled: !ok,
        onClick: () => {
          if (repayLoan(me, amt)) this.rebuild();
        },
      });
      this.content.add(btn);
      bx += 120;
    }

    // Combined pay-off (cash + savings). Surfaces a meaningful button when
    // the player has enough in cash + savings to clear the loan but not in
    // cash alone — saves them the "withdraw, then repay" two-step.
    const combinedAvailable = me.cash + me.savings;
    const canCombinedPay = me.loan > 0 && combinedAvailable > 0;
    if (canCombinedPay) {
      y += 38;
      const fullyClears = combinedAvailable >= me.loan;
      const label = fullyClears
        ? `Pay off loan in full  (uses cash + savings)`
        : `Pay all available  (cash + savings: ${formatMoney(combinedAvailable)})`;
      const payAllBtn = new Button({
        scene: this,
        x: left + 240, y: y + 12, width: 460, height: 30,
        label,
        bg: fullyClears ? 0x2f6042 : 0x4a5a30,
        bgHover: fullyClears ? 0x3f8055 : 0x5a6a40,
        onClick: () => {
          const paid = payOffLoanCombined(me);
          if (paid > 0) {
            GameState.get().pushNews(`${me.name} repaid ${formatMoney(paid)} of loan.`);
            this.rebuild();
          }
        },
      });
      this.content.add(payAllBtn);
    }

    y += 60;

    // ---- Savings ----
    this.addText(left, y, 'Savings', 18, COLORS.accentText);
    y += 28;
    this.addText(left, y, `Balance: ${formatMoney(me.savings)}`, 14);
    y += 22;
    this.addText(left, y, `Yield: ${(SAVINGS_APY * 100).toFixed(1)}% APY (paid daily)`, 13, COLORS.textDim);
    y += 30;

    this.addText(left, y, 'Deposit:', 13, COLORS.textDim);
    bx = left + 80;
    for (const amt of amounts) {
      const ok = me.cash >= amt;
      const btn = new Button({
        scene: this, x: bx + 60, y: y + 12, width: 110, height: 26,
        label: `+${formatMoney(amt)}`,
        disabled: !ok,
        onClick: () => { if (deposit(me, amt)) this.rebuild(); },
      });
      this.content.add(btn);
      bx += 120;
    }

    y += 38;
    this.addText(left, y, 'Withdraw:', 13, COLORS.textDim);
    bx = left + 80;
    const wAmts = [100_000, 500_000, 1_000_000, me.savings];
    const wLabels = ['$100K', '$500K', '$1M', 'All'];
    for (let i = 0; i < wAmts.length; i++) {
      const amt = wAmts[i];
      const ok = me.savings >= amt && amt > 0;
      const btn = new Button({
        scene: this, x: bx + 60, y: y + 12, width: 110, height: 26,
        label: `−${wLabels[i]}`,
        disabled: !ok,
        onClick: () => { if (withdraw(me, amt)) this.rebuild(); },
      });
      this.content.add(btn);
      bx += 120;
    }

    y += 60;
    y = this.drawAutoRules(me, left, y);

    this.addText(left, y + 8, 'Tip: Take a loan to expand the fleet faster — interest is paid daily.', 12, COLORS.textDim);
  }

  private drawAutoRules(me: { autoSaveAboveCash: number; autoWithdrawBelowCash: number }, left: number, startY: number): number {
    let y = startY;
    this.addText(left, y, 'Auto-rules', 18, COLORS.accentText);
    y += 28;
    this.addText(left, y,
      'Each game-day after interest: any cash above the deposit threshold goes to savings; if cash drops under the withdraw threshold, savings tops it back up.',
      11, COLORS.textDim);
    y += 32;

    // --- Auto-deposit above: ---
    this.addText(left, y, 'Auto-deposit above:', 13, COLORS.text);
    const depositPresets: Array<{ label: string; value: number }> = [
      { label: 'Off',  value: 0 },
      { label: '$1M',  value: 1_000_000 },
      { label: '$5M',  value: 5_000_000 },
      { label: '$10M', value: 10_000_000 },
      { label: '$25M', value: 25_000_000 },
      { label: '$50M', value: 50_000_000 },
    ];
    let bx = left + 200;
    for (const p of depositPresets) {
      const isActive = me.autoSaveAboveCash === p.value;
      const btn = new Button({
        scene: this, x: bx + 40, y: y + 12, width: 70, height: 26,
        label: p.label,
        bg: isActive ? 0x4a7a5e : 0x14304a,
        bgHover: isActive ? 0x5a8a6e : 0x2a5780,
        onClick: () => {
          me.autoSaveAboveCash = p.value;
          this.rebuild();
        },
      });
      this.content.add(btn);
      bx += 78;
    }

    y += 38;

    // --- Auto-withdraw below: ---
    this.addText(left, y, 'Auto-withdraw below:', 13, COLORS.text);
    const withdrawPresets: Array<{ label: string; value: number }> = [
      { label: 'Off',  value: 0 },
      { label: '$100K', value: 100_000 },
      { label: '$500K', value: 500_000 },
      { label: '$1M',  value: 1_000_000 },
      { label: '$2M',  value: 2_000_000 },
      { label: '$5M',  value: 5_000_000 },
    ];
    bx = left + 200;
    for (const p of withdrawPresets) {
      const isActive = me.autoWithdrawBelowCash === p.value;
      const btn = new Button({
        scene: this, x: bx + 40, y: y + 12, width: 70, height: 26,
        label: p.label,
        bg: isActive ? 0x4a7a5e : 0x14304a,
        bgHover: isActive ? 0x5a8a6e : 0x2a5780,
        onClick: () => {
          me.autoWithdrawBelowCash = p.value;
          this.rebuild();
        },
      });
      this.content.add(btn);
      bx += 78;
    }

    y += 50;
    return y;
  }
}
