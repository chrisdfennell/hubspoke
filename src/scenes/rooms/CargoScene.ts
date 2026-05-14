import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { acceptContract, dispatchCargo, CargoContract } from '../../systems/Cargo';
import { acceptCharter, dispatchCharter } from '../../systems/Charters';
import { CharterContract } from '../../state/Charter';
import { getCity, getPlaneModel, distanceKm, PLANE_MODELS } from '../../state/catalog';
import { dateToDay } from '../../state/demandModifiers';
import { getFuelPrice, suggestedTicketPrice } from '../../systems/Economy';

type ContractsTab = 'cargo' | 'charter';

function cargoDistanceKm(c: CargoContract): number {
  return distanceKm(getCity(c.fromCity), getCity(c.toCity));
}
function charterDistanceKm(c: CharterContract): number {
  return distanceKm(getCity(c.fromCity), getCity(c.toCity));
}

export class CargoScene extends RoomScene {
  /** Persisted across rebuild() within one scene visit so accepting /
   *  dispatching doesn't bounce you back to the Cargo tab. Reset to
   *  cargo on re-entry. */
  private currentTab: ContractsTab = 'cargo';

  constructor() { super('CargoScene'); this.title = 'Contracts Hall'; }

  create() {
    this.currentTab = 'cargo';
    super.create();
  }

  buildRoom() {
    const state = GameState.get();
    const b = this.panelBounds;
    const left = b.x + 30;
    const topY = b.y + 80;

    this.buildTabPicker(left, topY);
    const startY = topY + 40;
    if (this.currentTab === 'cargo') this.buildCargoTab(startY);
    else this.buildCharterTab(startY);

    void state; // referenced only for state.cargoOffers in sub-builders
  }

  private buildTabPicker(left: number, topY: number) {
    const state = GameState.get();
    const tabs: Array<{ id: ContractsTab; label: string }> = [
      { id: 'cargo',   label: `Cargo (${state.cargoOffers.length})` },
      { id: 'charter', label: `Charter (${state.charterOffers.length})` },
    ];
    let tx = left;
    for (const t of tabs) {
      const w = Math.max(140, 16 + t.label.length * 8);
      const isActive = this.currentTab === t.id;
      const btn = new Button({
        scene: this,
        x: tx + w / 2,
        y: topY,
        width: w,
        height: 26,
        label: t.label,
        bg: isActive ? 0x3d6a92 : 0x14304a,
        bgHover: isActive ? 0x4a7da8 : 0x2a5780,
        onClick: () => {
          this.currentTab = t.id;
          this.scrollTo(0);
          this.rebuild();
        },
      });
      this.content.add(btn);
      tx += w + 8;
    }
  }

  // ===== Cargo tab ======================================================
  private buildCargoTab(startY: number) {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const colW = (b.w - 80) / 2;
    const rightCol = left + colW + 40;
    const today = dateToDay(state.date);

    this.addText(left, startY, 'Available Contracts', 18, COLORS.accentText);
    let y = startY + 30;
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
      const tip = () => this.cargoTooltip(c);
      [pairTxt, weightTxt, dueTxt, payTxt].forEach(t => this.tooltip.attach(t, tip));

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

    this.addText(rightCol, startY, 'Active Contracts', 18, COLORS.accentText);
    y = startY + 30;

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

      const eligible = me.planes.filter(p =>
        p.status.kind === 'idle' &&
        getPlaneModel(p.modelId).cargoCapacityKg >= c.weightKg &&
        getPlaneModel(p.modelId).range >= cargoDistanceKm(c)
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

    y = Math.max(y, startY + 30 + (Math.max(state.cargoOffers.length, myActive.length) * 36)) + 30;
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

  // ===== Charter tab ====================================================
  private buildCharterTab(startY: number) {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const colW = (b.w - 80) / 2;
    const rightCol = left + colW + 40;
    const today = dateToDay(state.date);

    this.addText(left, startY, 'Available Charters', 18, COLORS.accentText);
    let y = startY + 30;
    if (state.charterOffers.length === 0) {
      this.addText(left, y, 'No charter offers right now. Check back tomorrow.', 13, COLORS.textDim);
    }

    for (const c of state.charterOffers) {
      const a = getCity(c.fromCity);
      const d = getCity(c.toCity);
      const daysLeft = c.dueDay - today;
      const lineColor = daysLeft <= 1 ? '#ff9aa6' : COLORS.text;

      const pairTxt = this.addText(left, y, `${a.name} → ${d.name}`, 13, lineColor);
      const paxTxt  = this.addText(left + 200, y, `${c.paxCount} pax`, 12, COLORS.textDim);
      const dueTxt  = this.addText(left + 290, y, `due in ${daysLeft}d`, 12, COLORS.textDim);
      const payTxt  = this.addText(left + 360, y, formatMoney(c.payment), 13, '#7be08a');
      const tip = () => this.charterTooltip(c);
      [pairTxt, paxTxt, dueTxt, payTxt].forEach(t => this.tooltip.attach(t, tip));

      const btn = new Button({
        scene: this,
        x: left + 470, y: y + 8, width: 100, height: 24,
        label: 'Accept',
        onClick: () => {
          if (acceptCharter(me, c.id)) {
            state.pushNews(`Accepted charter ${a.name} → ${d.name} (${formatMoney(c.payment)}, ${c.paxCount} pax).`);
            this.rebuild();
          }
        },
      });
      this.content.add(btn);
      y += 28;
    }

    this.addText(rightCol, startY, 'Active Charters', 18, COLORS.accentText);
    y = startY + 30;

    const myActive = state.charterActive.filter(c => c.ownerId === me.id);
    if (myActive.length === 0) {
      this.addText(rightCol, y, 'No active charters.', 13, COLORS.textDim);
    }

    for (const c of myActive) {
      const a = getCity(c.fromCity);
      const d = getCity(c.toCity);
      const daysLeft = c.dueDay - today;
      const inFlight = !!c.assignedPlaneId;
      const flyingPlane = inFlight ? me.planes.find(p => p.id === c.assignedPlaneId) : undefined;

      this.addText(rightCol, y, `${a.name} → ${d.name}`, 13);
      this.addText(rightCol + 200, y, `${c.paxCount} pax`, 12, COLORS.textDim);
      this.addText(rightCol + 290, y, `due in ${daysLeft}d`, 12, daysLeft <= 1 ? '#ff9aa6' : COLORS.textDim);
      y += 18;

      if (inFlight) {
        this.addText(rightCol, y, `↻ ${flyingPlane?.name ?? 'plane'} en route...`, 12, '#7be08a');
        y += 22;
        continue;
      }

      const eligible = me.planes.filter(p =>
        p.status.kind === 'idle' &&
        getPlaneModel(p.modelId).seats >= c.paxCount &&
        getPlaneModel(p.modelId).range >= charterDistanceKm(c)
      );

      if (eligible.length === 0) {
        this.addText(rightCol, y, 'No eligible plane (need idle + seats + range).', 11, '#ff9aa6');
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
            const result = dispatchCharter(me, c.id, plane.id);
            if (result.ok) {
              state.pushNews(`Dispatched ${plane.name} on charter ${a.name} → ${d.name}.`);
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

    y = Math.max(y, startY + 30 + (Math.max(state.charterOffers.length, myActive.length) * 36)) + 30;
    this.addText(left, y, 'Recent results', 14, COLORS.accentText);
    y += 22;
    if (state.charterCompleted.length === 0) {
      this.addText(left, y, 'No history yet.', 12, COLORS.textDim);
    } else {
      for (const c of state.charterCompleted.slice(0, 8)) {
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

  // ===== Tooltips =======================================================
  private cargoTooltip(c: CargoContract): string {
    const dist = cargoDistanceKm(c);
    const ratePerKgKm = c.payment / (c.weightKg * dist);
    const a = getCity(c.fromCity);
    const d = getCity(c.toCity);
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
      const fuelTotal = dist * m.fuelPerKm * fuel;
      const net = c.payment - fuelTotal;
      lines.push('');
      lines.push(`Best fit: ${m.name} (cap ${m.cargoCapacityKg.toLocaleString('en-US')} kg)`);
      lines.push(`Fuel @ $${fuel.toFixed(2)}/L: ${formatMoney(fuelTotal)}`);
      lines.push(`Net of fuel: ${formatMoney(net)}  ${net > 0 ? '✓' : '✗'}`);
    }
    return lines.join('\n');
  }

  private charterTooltip(c: CharterContract): string {
    const dist = charterDistanceKm(c);
    const a = getCity(c.fromCity);
    const d = getCity(c.toCity);
    const fairPerPax = suggestedTicketPrice(dist, a.demand, d.demand);
    const fair = fairPerPax * c.paxCount;
    const premiumX = c.payment / Math.max(1, fair);
    const fuel = getFuelPrice();
    const eligibleModels = PLANE_MODELS.filter(m => m.seats >= c.paxCount && m.range >= dist)
      .sort((x, y) => x.fuelPerKm - y.fuelPerKm);

    const lines: string[] = [
      `${a.name} → ${d.name}   (${Math.round(dist)} km)`,
      `Passengers: ${c.paxCount}`,
      `Payment: ${formatMoney(c.payment)}`,
      `vs fair fare × pax (${formatMoney(fair)}): ${premiumX.toFixed(2)}× premium`,
      `Penalty if missed: ${formatMoney(c.penalty)}  ·  reputation −${c.repPenalty}`,
    ];
    if (eligibleModels.length === 0) {
      lines.push('');
      lines.push('No plane in your catalog has enough seats AND range for this.');
    } else {
      const m = eligibleModels[0];
      const fuelTotal = dist * m.fuelPerKm * fuel;
      const net = c.payment - fuelTotal;
      lines.push('');
      lines.push(`Best fit: ${m.name} (${m.seats} seats)`);
      lines.push(`Fuel @ $${fuel.toFixed(2)}/L: ${formatMoney(fuelTotal)}`);
      lines.push(`Net of fuel: ${formatMoney(net)}  ${net > 0 ? '✓' : '✗'}`);
    }
    return lines.join('\n');
  }
}
