import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { visitContact, refreshContacts } from '../../systems/Lounge';
import { getFuelPrice } from '../../systems/Economy';
import { getPlaneModel } from '../../state/catalog';

export class LoungeScene extends RoomScene {
  /** Most recent visit summary to display below the contact list. */
  private lastSummary: string | null = null;

  constructor() { super('LoungeScene'); this.title = 'VIP Lounge — Connections'; }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    // First-time entry: contact list might be empty before the first day tick.
    // Seed it so the room isn't blank.
    if (state.loungeContacts.length === 0) refreshContacts();

    this.addText(left, y, `Cash: ${formatMoney(me.cash)}    Reputation: ${Math.round(me.reputation)} / 100`, 14, COLORS.accentText);
    y += 30;

    this.addText(left, y, 'Today\'s contacts (refresh daily):', 13, COLORS.textDim);
    y += 26;

    if (state.loungeContacts.length === 0) {
      this.addText(left, y, 'The lounge is quiet. Come back tomorrow.', 13, COLORS.textDim);
      return;
    }

    for (const c of state.loungeContacts) {
      const eligible = me.reputation >= c.minRep && me.cash >= c.fee;

      const nameTxt = this.addText(left, y, `${c.name}`, 15);
      const roleTxt = this.addText(left + 200, y, c.role, 13, COLORS.accentText);
      this.tooltip.attach(nameTxt, () => this.contactTooltip(c));
      this.tooltip.attach(roleTxt, () => this.contactTooltip(c));

      this.addText(left + 420, y, `Fee ${formatMoney(c.fee)}`, 13);
      if (c.minRep > 0) {
        this.addText(left + 560, y, `Rep ≥ ${c.minRep}`, 12, me.reputation >= c.minRep ? COLORS.textDim : '#ff9aa6');
      }
      y += 20;
      this.addText(left + 20, y, `“${c.pitch}”`, 12, COLORS.textDim);

      const btn = new Button({
        scene: this,
        x: left + 740, y: y - 6, width: 130, height: 28,
        label: 'Meet',
        disabled: !eligible,
        onClick: () => {
          const result = visitContact(me, c.id);
          if (result.ok) {
            this.lastSummary = `${c.name}: ${result.summary}`;
          } else {
            this.lastSummary = `Couldn't meet ${c.name}: ${result.reason}`;
          }
          this.rebuild();
        },
      });
      this.content.add(btn);
      y += 32;
    }

    if (this.lastSummary) {
      y += 16;
      this.addText(left, y, this.lastSummary, 13, '#7be08a');
    }
  }

  /**
   * Build a richer tooltip for a contact — most importantly previewing the
   * Commodities Trader's fuel-hedge effect against your real fleet.
   */
  private contactTooltip(c: import('../../systems/Lounge').Contact): string {
    const me = GameState.get().human;
    const fuelNow = getFuelPrice();
    switch (c.kind) {
      case 'fuel-trader': {
        const fuelAfter = fuelNow * 0.75;
        const lines: string[] = [
          `Fuel hedge — Commodities Trader`,
          `Fee: ${formatMoney(c.fee)}`,
          `Current fuel: $${fuelNow.toFixed(2)} / L`,
          `After deal:   $${fuelAfter.toFixed(2)} / L  (-25%)`,
        ];
        // Estimate per-flight savings on a rough average flight.
        if (me.planes.length > 0) {
          const sample = me.planes.reduce((best, p) =>
            getPlaneModel(p.modelId).fuelPerKm > getPlaneModel(best.modelId).fuelPerKm ? p : best);
          const m = getPlaneModel(sample.modelId);
          // Take a representative 3000 km long-haul to show savings.
          const distKm = 3000;
          const before = distKm * m.fuelPerKm * fuelNow;
          const after  = distKm * m.fuelPerKm * fuelAfter;
          lines.push('');
          lines.push(`Sample 3,000 km flight on ${m.name}:`);
          lines.push(`  Fuel before: ${formatMoney(before)}`);
          lines.push(`  Fuel after:  ${formatMoney(after)}`);
          lines.push(`  You save:    ${formatMoney(before - after)} per leg`);
        }
        return lines.join('\n');
      }
      case 'maintenance-inspector': {
        const damaged = me.planes.filter(p => p.condition < 1).length;
        return [
          `Maintenance Inspector — restores all planes to 100%`,
          `Fee: ${formatMoney(c.fee)}`,
          `${damaged} of ${me.planes.length} plane(s) currently below 100%.`,
        ].join('\n');
      }
      case 'aviation-lobbyist':
        return [
          `Aviation Lobbyist`,
          `+30% Honolulu demand for 4 days`,
          `Best paired with HNL-routed flights you already operate.`,
        ].join('\n');
      case 'stock-analyst':
        return [
          `Insider Stock Analyst`,
          `Reveals the most undervalued rival by current price vs. fundamental.`,
          `Use the Stocks room to act on the tip the same day.`,
        ].join('\n');
      case 'marketing-guru':
        return `Marketing Guru — +8 reputation. Higher rep raises share price (Stocks).`;
      case 'press-baron':
        return `Press Baron — +4 your rep, −4 random rival's rep.`;
      case 'mob-fixer':
        return `Mob Fixer — −10 rep + plane damage on a random rival. 30% chance you take −6 rep heat.`;
    }
    return c.role;
  }
}
