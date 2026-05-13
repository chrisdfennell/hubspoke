import { GameState, GameDate } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { ITEMS, ItemCategory, applyBoostEffect } from '../../state/items';
import { getCEO } from '../../state/ceos';

/** Absolute day index — simplified 30-day months, 12-month years. Used by
 *  the boost cooldown so "once per game-day" survives month/year rollover. */
function dayCount(d: GameDate): number {
  return ((d.year * 12) + (d.month - 1)) * 30 + (d.day - 1);
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  sabotage: 'Sabotage',
  defense: 'Defense',
  boost: 'Boosts',
};

export class DutyFreeScene extends RoomScene {
  constructor() { super('DutyFreeScene'); this.title = 'Duty Free — Inventory & Boosts'; }

  buildRoom() {
    const me = GameState.get().human;
    const ceo = getCEO(me.ceoId);
    // Mario's perk discounts all Duty Free purchases. Read live so a future
    // CEO swap (via a save-edit or new game) takes effect without a rebuild.
    const priceMult = ceo?.perks.dutyFreeMult ?? 1.0;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y, `Cash: ${formatMoney(me.cash)}`, 16, me.cash < 0 ? '#ff7b88' : COLORS.accentText);
    if (priceMult < 1) {
      this.addText(left + 200, y + 4,
        `CEO discount: ${Math.round((1 - priceMult) * 100)}% off all items`,
        12, '#ffc857');
    }
    y += 32;

    const cats: ItemCategory[] = ['sabotage', 'defense', 'boost'];
    for (const cat of cats) {
      this.addText(left, y, CATEGORY_LABEL[cat], 18, COLORS.accentText);
      y += 26;
      // Headers. Boosts fire instantly so they never accumulate in
      // inventory — for that category we replace the "Owned" column with
      // a "Today" cooldown indicator.
      const isBoost = cat === 'boost';
      this.addText(left,        y, 'Item',                       12, COLORS.textDim);
      this.addText(left + 240,  y, 'Price',                      12, COLORS.textDim);
      this.addText(left + 340,  y, isBoost ? 'Today' : 'Owned',  12, COLORS.textDim);
      this.addText(left + 410,  y, 'Description',                12, COLORS.textDim);
      y += 20;

      for (const item of ITEMS.filter(i => i.category === cat)) {
        const owned = me.inventory[item.id] ?? 0;
        const price = Math.round(item.price * priceMult);
        const isInstantBoost = cat === 'boost';
        // Boosts share a one-use-per-game-day cooldown each — keeps the
        // player from buying their way from low rep to 100 in a single
        // shopping spree. Cooldown is recorded per-item so different
        // boosts don't share it.
        const today = dayCount(GameState.get().date);
        const usedOn = me.boostUsedOn[item.id] ?? -1;
        const onCooldown = isInstantBoost && usedOn === today;
        this.addText(left,       y + 6, item.name, 13);
        this.addText(left + 240, y + 6, formatMoney(price), 13);
        if (isInstantBoost) {
          // "Ready" / "Used" instead of a numeric inventory count.
          this.addText(left + 340, y + 6, onCooldown ? 'Used' : 'Ready', 13,
            onCooldown ? '#ff9aa6' : '#7be08a');
        } else {
          this.addText(left + 340, y + 6, owned.toString(), 13);
        }
        this.addText(left + 410, y + 6, item.description, 12, COLORS.textDim);
        if (onCooldown) {
          this.addText(left + 410, y + 22, 'Available again tomorrow.', 11, '#ff9aa6');
        }

        const canAfford = me.cash >= price;
        const buyLabel = isInstantBoost
          ? (onCooldown ? 'Used today' : 'Buy & Use')
          : 'Buy';

        const btn = new Button({
          scene: this,
          x: left + 880, y: y + 14, width: 100, height: 26,
          label: buyLabel,
          disabled: !canAfford || onCooldown,
          onClick: () => {
            if (!canAfford || onCooldown) return;
            me.cash -= price;
            if (isInstantBoost) {
              this.applyBoost(item.id);
              me.boostUsedOn[item.id] = today;
            } else {
              me.inventory[item.id] = (me.inventory[item.id] ?? 0) + 1;
            }
            GameState.get().pushNews(`${me.name} purchased ${item.name}.`);
            this.rebuild();
          },
        });
        this.content.add(btn);
        y += onCooldown ? 38 : 30;
      }
      y += 20;
    }

    this.addText(left, y, 'Sabotage and defense items go to your inventory — use them in Security.', 12, COLORS.textDim);
  }

  private applyBoost(id: string) {
    applyBoostEffect(GameState.get().human, id);
  }
}
