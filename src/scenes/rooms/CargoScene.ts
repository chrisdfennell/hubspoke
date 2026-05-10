import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { acceptContract, dispatchCargo, CargoContract } from '../../systems/Cargo';
import { getCity, getPlaneModel, distanceKm, PLANE_MODELS } from '../../state/catalog';
import { dateToDay } from '../../state/demandModifiers';
import { getFuelPrice } from '../../systems/Economy';

function contractDistanceKm(c: CargoContract): number {
  return distanceKm(getCity(c.fromCity), getCity(c.toCity));
}

export class CargoScene extends RoomScene {
  constructor() { super('CargoScene'); this.title = 'Cargo Hall — Freight Contracts'; }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const colW = (b.w - 80) / 2;
    const rightCol = left + colW + 40;
    const today = dateToDay(state.date);

    // ===== LEFT: available offers =====
    this.addText(left, b.y + 80, 'Available Contracts', 18, COLORS.accentText);
    let y = b.y + 110;
    if (state.cargoOffers.length === 0) {
      this.addText(left, y, 'No contracts on the board. Check back tomorrow.', 13, COLORS.textDim);
    }

    for (const c of state.cargoOffers) {
      const a = getCity(c.fromCity);
      const d = getCity(c.toCity);
      const daysLeft = c.dueDay - today;
      const lineColor = daysLeft <= 1 ? '#ff9aa6' : COLORS.text;

      const pairTxt   = this.addText(left, y, `${a.name} → ${d.name}`, 13, lineColor);
      const weightTxt = this.addText(left + 200, y, `${c.weightKg.toLocaleString('en-US')} kg`, 12, COLORS.textDim);
      const dueTxt    = this.addText(left + 290, y, `due in ${daysLeft}d`, 12, COLORS.textDim);
      const payTxt    = this.addText(left + 360, y, formatMoney(c.payment), 13, '#7be08a');
      const tip = () => this.contractTooltip(c);
      this.tooltip.attach(pairTxt,   tip);
      this.tooltip.attach(weightTxt, tip);
      this.tooltip.attach(dueTxt,    tip);
      this.tooltip.attach(payTxt,    tip);

      const btn = new Button({
        scene: this,
        x: left + 470, y: y + 8, width: 100, height: 24,
        label: 'Accept',
        onClick: () => {
          if (acceptContract(me, c.id)) {
            state.pushNews(`Accepted cargo contract ${a.name} → ${d.name} (${formatMoney(c.payment)}).`);
            this.rebuild();
          }
        },
      });
      this.content.add(btn);
      y += 28;
    }

    // ===== RIGHT: active contracts =====
    this.addText(rightCol, b.y + 80, 'Active Contracts', 18, COLORS.accentText);
    y = b.y + 110;

    const myActive = state.cargoActive.filter(c => c.ownerId === me.id);
    if (myActive.length === 0) {
      this.addText(rightCol, y, 'No active contracts.', 13, COLORS.textDim);
    }

    for (const c of myActive) {
      const a = getCity(c.fromCity);
      const d = getCity(c.toCity);
      const daysLeft = c.dueDay - today;
      const inFlight = !!c.assignedPlaneId;
      const flyingPlane = inFlight ? me.planes.find(p => p.id === c.assignedPlaneId) : undefined;

      this.addText(rightCol, y, `${a.name} → ${d.name}`, 13);
      this.addText(rightCol + 200, y, `${c.weightKg.toLocaleString('en-US')} kg`, 12, COLORS.textDim);
      this.addText(rightCol + 290, y, `due in ${daysLeft}d`, 12, daysLeft <= 1 ? '#ff9aa6' : COLORS.textDim);
      y += 18;

      if (inFlight) {
        this.addText(rightCol, y, `↻ ${flyingPlane?.name ?? 'plane'} ferrying...`, 12, '#7be08a');
        y += 22;
        continue;
      }

      // Show eligible planes (idle + capable + range)
      const eligible = me.planes.filter(p =>
        p.status.kind === 'idle' &&
        getPlaneModel(p.modelId).cargoCapacityKg >= c.weightKg &&
        getPlaneModel(p.modelId).range >= contractDistanceKm(c)
      );

      if (eligible.length === 0) {
        this.addText(rightCol, y, 'No eligible plane (need idle + capacity + range).', 11, '#ff9aa6');
        y += 22;
        continue;
      }

      this.addText(rightCol, y, 'Dispatch:', 11, COLORS.textDim);
      let bx = rightCol + 70;
      for (const plane of eligible) {
        const labelW = Math.max(80, 12 + plane.name.length * 6);
        const btn = new Button({
          scene: this,
          x: bx + labelW / 2, y: y + 10, width: labelW, height: 22,
          label: plane.name,
          onClick: () => {
            const result = dispatchCargo(me, c.id, plane.id);
            if (result.ok) {
              state.pushNews(`Dispatched ${plane.name} on cargo ${a.name} → ${d.name}.`);
              this.rebuild();
            } else {
              state.pushNews(`Dispatch failed: ${result.reason}`);
              this.rebuild();
            }
          },
        });
        this.content.add(btn);
        bx += labelW + 6;
      }
      y += 30;
    }

    // ===== Bottom: recent completed =====
    y = Math.max(y, b.y + 110 + (Math.max(state.cargoOffers.length, myActive.length) * 36)) + 30;
    this.addText(left, y, 'Recent results', 14, COLORS.accentText);
    y += 22;
    if (state.cargoCompleted.length === 0) {
      this.addText(left, y, 'No history yet.', 12, COLORS.textDim);
    } else {
      for (const c of state.cargoCompleted.slice(0, 8)) {
        const a = getCity(c.fromCity);
        const d = getCity(c.toCity);
        const isMe = c.ownerId === me.id;
        const sign = c.status === 'delivered' ? '+' : '−';
        const amt = c.status === 'delivered' ? c.payment : c.penalty;
        const color = c.status === 'delivered' ? '#7be08a' : '#ff9aa6';
        const owner = state.players.find(p => p.id === c.ownerId);
        const ownerLabel = isMe ? 'you' : (owner?.name ?? '?');
        this.addText(left, y, `${ownerLabel}: ${a.name} → ${d.name} (${c.status})  ${sign}${formatMoney(amt)}`, 12, color);
        y += 16;
      }
    }
  }

  /** Detailed breakdown of a cargo contract — rate, fuel cost, net to bottom-line. */
  private contractTooltip(c: CargoContract): string {
    const dist = contractDistanceKm(c);
    const ratePerKgKm = c.payment / (c.weightKg * dist);
    const a = getCity(c.fromCity);
    const d = getCity(c.toCity);

    // Find the smallest plane that can carry this contract — usually the most
    // efficient choice, so net-of-fuel preview is illuminating.
    const eligibleModels = PLANE_MODELS.filter(m => m.cargoCapacityKg >= c.weightKg && m.range >= dist)
      .sort((x, y) => x.fuelPerKm - y.fuelPerKm);
    const fuel = getFuelPrice();

    const lines: string[] = [
      `${a.name} → ${d.name}   (${Math.round(dist)} km)`,
      `Payload: ${c.weightKg.toLocaleString('en-US')} kg`,
      `Payment: ${formatMoney(c.payment)}`,
      `Rate: $${ratePerKgKm.toFixed(4)} per kg-km`,
      `Penalty if missed: ${formatMoney(c.penalty)}  ·  reputation −${c.repPenalty}`,
    ];
    if (eligibleModels.length === 0) {
      lines.push('');
      lines.push('No plane model in your reach can fly this — too heavy or too far.');
    } else {
      const m = eligibleModels[0];
      const fuelCost = dist * m.fuelPerKm * fuel;
      const net = c.payment - fuelCost;
      lines.push('');
      lines.push(`Best fit: ${m.name} (cap ${m.cargoCapacityKg.toLocaleString('en-US')} kg)`);
      lines.push(`Fuel @ $${fuel.toFixed(2)}/L: ${formatMoney(fuelCost)}`);
      lines.push(`Net of fuel: ${formatMoney(net)}  ${net > 0 ? '✓' : '✗'}`);
    }
    return lines.join('\n');
  }
}

