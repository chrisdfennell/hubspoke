import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { formatMoney } from '../../systems/Clock';
import { PLANE_MODELS, PlaneModel, getCity } from '../../state/catalog';
import { Plane } from '../../state/Plane';
import { getFuelPrice } from '../../systems/Economy';
import { sound } from '../../systems/Sound';

export class WorkshopScene extends RoomScene {
  constructor() { super('WorkshopScene'); this.title = 'Workshop — Buy Planes'; }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y, `Cash: ${formatMoney(me.cash)}`, 16, me.cash < 0 ? '#ff7b88' : COLORS.accentText);
    y += 36;

    // Column headers
    this.addText(left,        y, 'Model',    12, COLORS.textDim);
    this.addText(left + 240,  y, 'Seats',    12, COLORS.textDim);
    this.addText(left + 310,  y, 'Range',    12, COLORS.textDim);
    this.addText(left + 400,  y, 'Speed',    12, COLORS.textDim);
    this.addText(left + 490,  y, 'Fuel/km',  12, COLORS.textDim);
    this.addText(left + 580,  y, 'Price',    12, COLORS.textDim);
    y += 22;

    for (const m of PLANE_MODELS) {
      const nameTxt   = this.addText(left,       y + 6, m.name, 13);
      const seatsTxt  = this.addText(left + 240, y + 6, `${m.seats}`, 13);
      const rangeTxt  = this.addText(left + 310, y + 6, `${m.range} km`, 13);
      const speedTxt  = this.addText(left + 400, y + 6, `${m.speed} km/h`, 13);
      const fuelTxt   = this.addText(left + 490, y + 6, `${m.fuelPerKm.toFixed(1)} L`, 13);
      const priceTxt  = this.addText(left + 580, y + 6, formatMoney(m.price), 13);
      const tip = () => this.modelTooltip(m);
      [nameTxt, seatsTxt, rangeTxt, speedTxt, fuelTxt, priceTxt].forEach(t => this.tooltip.attach(t, tip));

      const canAfford = me.cash >= m.price;
      const btn = new Button({
        scene: this,
        x: left + 760,
        y: y + 14,
        width: 110,
        height: 28,
        label: canAfford ? 'Buy' : 'Too expensive',
        onClick: () => {
          if (me.cash < m.price) return;
          me.cash -= m.price;
          // Park the new plane at the hub the player is currently focused on,
          // not the global default — fixes a multi-hub bug where a London-
          // operator buying a plane would find it sitting in Honolulu.
          const home = state.activeHub;
          const plane = new Plane(m.id, home);
          me.planes.push(plane);
          state.pushNews(`${me.name} purchased a ${m.name} (${plane.name}) at ${getCity(home).name}.`);
          sound.play('buy');
          this.rebuild();
        },
        disabled: !canAfford,
      });
      this.content.add(btn);

      y += 36;
    }

    // Fleet section: condition + (placeholder) repair button.
    y += 12;
    this.addText(left, y, 'Your fleet', 16, COLORS.accentText);
    y += 24;
    if (me.planes.length === 0) {
      this.addText(left, y, 'No planes owned. Buy one above to get started.', 13, COLORS.textDim);
      return;
    }
    this.addText(left,       y, 'Name',   12, COLORS.textDim);
    this.addText(left + 280, y, 'Model',  12, COLORS.textDim);
    this.addText(left + 500, y, 'Cond',   12, COLORS.textDim);
    y += 20;
    for (const plane of me.planes) {
      this.addText(left,       y + 6, plane.name, 13);
      this.addText(left + 280, y + 6, plane.model.name, 13);
      this.addText(left + 500, y + 6, `${Math.round(plane.condition * 100)}%`, 13, plane.condition < 0.5 ? '#ff7b88' : COLORS.text);

      // 2% of plane price per condition point — a brand-new plane down to 50%
      // condition costs ~1% of the plane's price to fully restore, on top of
      // amortized daily maintenance.
      const repairCost = Math.round((1 - plane.condition) * plane.model.price * 0.02);
      const needsWork = plane.condition < 0.99;
      const canPay = me.cash >= repairCost;
      const repairBtn = new Button({
        scene: this,
        x: left + 700,
        y: y + 14,
        width: 130,
        height: 28,
        label: needsWork ? `Repair  ${formatMoney(repairCost)}` : 'Pristine',
        onClick: () => {
          if (!needsWork || me.cash < repairCost) return;
          me.cash -= repairCost;
          plane.condition = 1.0;
          this.rebuild();
        },
        disabled: !needsWork || !canPay,
      });
      this.content.add(repairBtn);

      const renameBtn = new Button({
        scene: this,
        x: left + 850,
        y: y + 14,
        width: 90,
        height: 28,
        label: 'Rename',
        onClick: () => {
          Modal.prompt(this, {
            title: 'Rename plane',
            message: `New name for ${plane.name}:`,
            default: plane.name,
            minLen: 1,
            maxLen: 32,
            onSubmit: (next) => {
              plane.name = next;
              this.rebuild();
            },
          });
        },
      });
      this.content.add(renameBtn);
      y += 36;
    }
  }

  /** Per-model economics tooltip — fuel cost per km, break-even passengers, $/seat. */
  private modelTooltip(m: PlaneModel): string {
    const fuel = getFuelPrice();
    const fuelPerKm = m.fuelPerKm * fuel;          // $ per km
    const dollarPerSeat = m.price / m.seats;
    // Round-trip fuel cost on a 1000 km route.
    const sample1000 = 2 * 1000 * m.fuelPerKm * fuel;
    // Daily maintenance bill (24h × per-hour).
    const dailyMaint = m.maintenancePerHour * 24;

    return [
      `${m.manufacturer} ${m.name}`,
      `Capital: ${formatMoney(m.price)}  (${formatMoney(dollarPerSeat)} per seat)`,
      `Cargo capacity: ${m.cargoCapacityKg.toLocaleString('en-US')} kg`,
      `Range: ${m.range} km   ·   Cruise: ${m.speed} km/h`,
      `Fuel @ $${fuel.toFixed(2)}/L:  $${fuelPerKm.toFixed(2)} per km`,
      `1,000 km round-trip fuel:  ${formatMoney(sample1000)}`,
      `Daily maintenance:  ${formatMoney(dailyMaint)}`,
    ].join('\n');
  }
}
