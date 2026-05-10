import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import {
  creditLimit, takeLoan, repayLoan, deposit, withdraw,
  effectiveLoanApr, SAVINGS_APY,
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
    y += 30;

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
    const repayLabels = ['$100K', '$500K', '$1M', 'All'];
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
    this.addText(left, y, 'Tip: Take a loan to expand the fleet faster — interest is paid daily.', 12, COLORS.textDim);
  }
}
