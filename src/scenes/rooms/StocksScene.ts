import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import {
  buyShares, sellShares, fundamentalValue, portfolioValue,
  issueShares, buyBackShares, getFloat, publicFloat, MAX_IPO_FRACTION,
  setDividend, DIVIDEND_OPTIONS, DIVIDEND_INTERVAL_DAYS,
} from '../../systems/Stocks';
import { dateToDay } from '../../state/demandModifiers';

export class StocksScene extends RoomScene {
  constructor() { super('StocksScene'); this.title = 'Stock Market'; }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y, `Cash: ${formatMoney(me.cash)}    Portfolio value: ${formatMoney(portfolioValue(me))}`, 16, COLORS.accentText);
    y += 32;

    // ===== Your airline — IPO / buyback panel ============================
    const myPrice = state.stockPrices[me.id] ?? 0;
    const myFloat = getFloat(me.id);
    const myPublic = publicFloat(me.id);
    const ipoCap = Math.floor(myFloat * MAX_IPO_FRACTION);

    this.addText(left, y, `${me.name} — treasury actions`, 16, COLORS.accentText);
    y += 22;
    this.addText(left, y,
      `Float: ${myFloat.toLocaleString('en-US')}   ·   Public-held: ${myPublic.toLocaleString('en-US')}   ·   Price: $${myPrice.toFixed(2)}`,
      12, COLORS.textDim);
    y += 22;

    // IPO row — sell new shares for cash, dilutes everyone.
    const ipoAmounts: number[] = [10_000, 50_000, ipoCap].filter((n, i, a) => n > 0 && a.indexOf(n) === i);
    this.addText(left, y + 6, 'Issue shares (IPO):', 12);
    let bx = left + 150;
    for (const n of ipoAmounts) {
      const raised = Math.round(myPrice * n);
      const overCap = n > ipoCap;
      const labelN = n === ipoCap ? `Max (${n.toLocaleString('en-US')})` : `+${n.toLocaleString('en-US')}`;
      const btn = new Button({
        scene: this, x: bx + 60, y: y + 14, width: 130, height: 24,
        label: `${labelN}  ${formatMoney(raised)}`,
        disabled: overCap,
        onClick: () => {
          const result = issueShares(me, n);
          if (result.ok) {
            state.pushNews(`★ ${me.name} issued ${n.toLocaleString('en-US')} new shares for ${formatMoney(result.raised)} (IPO).`);
            this.rebuild();
          } else {
            state.pushNews(`IPO failed: ${result.reason}`);
            this.rebuild();
          }
        },
      });
      this.content.add(btn);
      bx += 140;
    }
    y += 30;

    // Buyback row — retire shares from public float at market price.
    this.addText(left, y + 6, 'Buy back shares:', 12);
    bx = left + 150;
    const buybackAmounts: number[] = [10_000, 50_000, myPublic].filter((n, i, a) => n > 0 && a.indexOf(n) === i);
    for (const n of buybackAmounts) {
      const cost = Math.round(myPrice * n);
      const canAfford = me.cash >= cost && n <= myPublic;
      const labelN = n === myPublic && myPublic > 0 ? `All (${n.toLocaleString('en-US')})` : `−${n.toLocaleString('en-US')}`;
      const btn = new Button({
        scene: this, x: bx + 60, y: y + 14, width: 130, height: 24,
        label: `${labelN}  ${formatMoney(cost)}`,
        disabled: !canAfford,
        onClick: () => {
          const result = buyBackShares(me, n);
          if (result.ok) {
            state.pushNews(`${me.name} bought back ${n.toLocaleString('en-US')} shares for ${formatMoney(result.cost)}.`);
            this.rebuild();
          } else {
            state.pushNews(`Buyback failed: ${result.reason}`);
            this.rebuild();
          }
        },
      });
      this.content.add(btn);
      bx += 140;
    }
    y += 30;

    // Dividend row — quarterly $/share paid to all holders. Hover shows
    // the upcoming cost given the current float; clicking sets the rate
    // and snaps the dividend clock to today.
    const today = dateToDay(state.date);
    const daysToNext = Math.max(0, DIVIDEND_INTERVAL_DAYS - (today - me.lastDividendDay));
    const nextCost = Math.round(me.dividendPerShare * myFloat);
    const divLabel = me.dividendPerShare > 0
      ? `Dividend: $${me.dividendPerShare.toFixed(2)}/share/qtr  ·  next ${formatMoney(nextCost)} in ${daysToNext}d`
      : 'Dividend: none declared';
    this.addText(left, y + 6, divLabel, 12, me.dividendPerShare > 0 ? '#7be08a' : COLORS.text);
    bx = left + 460;
    for (const rate of DIVIDEND_OPTIONS) {
      const isCurrent = me.dividendPerShare === rate;
      const labelN = rate === 0 ? 'Off' : `$${rate.toFixed(2)}`;
      const btn = new Button({
        scene: this, x: bx + 30, y: y + 14, width: 60, height: 24,
        label: isCurrent ? `✓ ${labelN}` : labelN,
        disabled: isCurrent,
        onClick: () => {
          setDividend(me, rate);
          if (rate > 0) {
            state.pushNews(`${me.name} declared a $${rate.toFixed(2)}/share quarterly dividend — first payment in ${DIVIDEND_INTERVAL_DAYS} days.`);
          } else {
            state.pushNews(`${me.name} cancelled its quarterly dividend.`);
          }
          this.rebuild();
        },
      });
      this.content.add(btn);
      bx += 68;
    }
    y += 42;

    // ===== Market table ===================================================
    this.addText(left, y, 'Airline',     12, COLORS.textDim);
    this.addText(left + 180, y, 'Price',  12, COLORS.textDim);
    this.addText(left + 270, y, 'Fund.',  12, COLORS.textDim);
    this.addText(left + 360, y, 'Float',  12, COLORS.textDim);
    this.addText(left + 430, y, 'Div',    12, COLORS.textDim);
    this.addText(left + 490, y, 'You own',12, COLORS.textDim);
    y += 22;

    for (const player of state.players) {
      const price = state.stockPrices[player.id] ?? 0;
      const fund  = fundamentalValue(player);
      const owned = me.holdings[player.id] ?? 0;
      const float = getFloat(player.id);
      const div = player.dividendPerShare;

      const row = y + 14;
      this.addText(left,       y + 4, player.name, 14);
      this.addText(left + 180, y + 4, `$${price.toFixed(2)}`, 13);
      this.addText(left + 270, y + 4, `$${fund.toFixed(2)}`, 13, COLORS.textDim);
      this.addText(left + 360, y + 4, (float / 1_000_000).toFixed(2) + 'M', 13, COLORS.textDim);
      this.addText(left + 430, y + 4, div > 0 ? `$${div.toFixed(2)}` : '—', 13, div > 0 ? '#7be08a' : COLORS.textDim);
      this.addText(left + 490, y + 4, owned.toLocaleString('en-US'), 13);

      const tradeAmounts = [100, 1_000, 10_000];
      bx = left + 600;
      for (const n of tradeAmounts) {
        const cost = price * n;
        const canBuy = me.cash >= cost;
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

    y += 14;
    this.addText(left, y, 'Prices drift daily toward fundamental (equity ÷ float, scaled by reputation).', 12, COLORS.textDim);
    y += 16;
    this.addText(left, y, `IPO mints new shares (capped at ${Math.floor(MAX_IPO_FRACTION * 100)}% of float per round) — fast cash, dilutes value.`, 12, COLORS.textDim);
    y += 16;
    this.addText(left, y, 'Buybacks retire shares from public float — costs cash, lifts price, blocks hostile takeover.', 12, COLORS.textDim);
    y += 16;
    this.addText(left, y, `Dividends pay every ${DIVIDEND_INTERVAL_DAYS} days × per-share × float — drains cash, lifts reputation, attracts AI buyers.`, 12, COLORS.textDim);
  }
}
