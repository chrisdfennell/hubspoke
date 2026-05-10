import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { ITEMS, ItemCategory } from '../../state/items';
import { getPlaneModel } from '../../state/catalog';
import { getCEO } from '../../state/ceos';

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
      // Headers
      this.addText(left,        y, 'Item',        12, COLORS.textDim);
      this.addText(left + 240,  y, 'Price',       12, COLORS.textDim);
      this.addText(left + 340,  y, 'Owned',       12, COLORS.textDim);
      this.addText(left + 410,  y, 'Description', 12, COLORS.textDim);
      y += 20;

      for (const item of ITEMS.filter(i => i.category === cat)) {
        const owned = me.inventory[item.id] ?? 0;
        const price = Math.round(item.price * priceMult);
        this.addText(left,       y + 6, item.name, 13);
        this.addText(left + 240, y + 6, formatMoney(price), 13);
        this.addText(left + 340, y + 6, owned.toString(), 13);
        this.addText(left + 410, y + 6, item.description, 12, COLORS.textDim);

        const canAfford = me.cash >= price;
        const isInstantBoost = cat === 'boost';
        const buyLabel = isInstantBoost ? 'Buy & Use' : 'Buy';

        const btn = new Button({
          scene: this,
          x: left + 880, y: y + 14, width: 100, height: 26,
          label: buyLabel,
          disabled: !canAfford,
          onClick: () => {
            if (!canAfford) return;
            me.cash -= price;
            if (isInstantBoost) {
              this.applyBoost(item.id);
            } else {
              me.inventory[item.id] = (me.inventory[item.id] ?? 0) + 1;
            }
            GameState.get().pushNews(`${me.name} purchased ${item.name}.`);
            this.rebuild();
          },
        });
        this.content.add(btn);
        y += 30;
      }
      y += 20;
    }

    this.addText(left, y, 'Sabotage and defense items go to your inventory — use them in Security.', 12, COLORS.textDim);
  }

  private applyBoost(id: string) {
    const me = GameState.get().human;
    switch (id) {
      case 'marketing':
        me.reputation = Math.min(100, me.reputation + 5);
        break;
      case 'press-spin':
        me.reputation = Math.min(100, me.reputation + 3);
        break;
      case 'pilot-prog':
        for (const plane of me.planes) {
          plane.condition = Math.min(1.0, plane.condition + 0.20);
          // Clear any lingering reference to the model (no-op, just here for future use).
          void getPlaneModel(plane.modelId);
        }
        break;
    }
  }
}
