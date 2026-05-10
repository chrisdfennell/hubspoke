import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { buyShares, sellShares, fundamentalValue, portfolioValue } from '../../systems/Stocks';

export class StocksScene extends RoomScene {
  constructor() { super('StocksScene'); this.title = 'Stock Market'; }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y, `Cash: ${formatMoney(me.cash)}    Portfolio value: ${formatMoney(portfolioValue(me))}`, 16, COLORS.accentText);
    y += 36;

    // Headers
    this.addText(left,        y, 'Airline',     12, COLORS.textDim);
    this.addText(left + 220,  y, 'Price',       12, COLORS.textDim);
    this.addText(left + 320,  y, 'Fundamental', 12, COLORS.textDim);
    this.addText(left + 460,  y, 'You own',     12, COLORS.textDim);
    y += 22;

    for (const player of state.players) {
      const price = state.stockPrices[player.id] ?? 0;
      const fund  = fundamentalValue(player);
      const owned = me.holdings[player.id] ?? 0;

      const row = y + 14;
      this.addText(left,        y + 4, player.name, 14);
      this.addText(left + 220,  y + 4, `$${price.toFixed(2)}`, 13);
      this.addText(left + 320,  y + 4, `$${fund.toFixed(2)}`, 13, COLORS.textDim);
      this.addText(left + 460,  y + 4, owned.toLocaleString('en-US'), 13);

      const tradeAmounts = [100, 1_000, 10_000];
      let bx = left + 580;
      for (const n of tradeAmounts) {
        const cost = price * n;
        const canBuy = me.cash >= cost && player.id !== 'self-only-this-block';
        const btn = new Button({
          scene: this, x: bx + 38, y: row, width: 70, height: 24,
          label: `Buy ${n}`,
          disabled: !canBuy,
          onClick: () => {
            if (buyShares(me, player.id, n)) {
              state.pushNews(`${me.name} bought ${n} shares of ${player.name} for ${formatMoney(cost)}.`);
              this.rebuild();
            }
          },
        });
        this.content.add(btn);
        bx += 78;
      }
      for (const n of tradeAmounts) {
        const proceeds = price * n;
        const canSell = (me.holdings[player.id] ?? 0) >= n;
        const btn = new Button({
          scene: this, x: bx + 38, y: row, width: 70, height: 24,
          label: `Sell ${n}`,
          disabled: !canSell,
          onClick: () => {
            if (sellShares(me, player.id, n)) {
              state.pushNews(`${me.name} sold ${n} shares of ${player.name} for ${formatMoney(proceeds)}.`);
              this.rebuild();
            }
          },
        });
        this.content.add(btn);
        bx += 78;
      }

      y += 34;
    }

    y += 20;
    this.addText(left, y, 'Prices drift daily toward the fundamental (cash + 0.4 × fleet − loan, scaled by reputation).', 12, COLORS.textDim);
    y += 18;
    this.addText(left, y, 'Bigger trades push prices in your direction. Treasury shares (your own airline) have the strongest signal.', 12, COLORS.textDim);
  }
}
