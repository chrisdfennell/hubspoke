import Phaser from 'phaser';
import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import {
  hirePilot, firePilot, hireMechanic, fireMechanic,
  PILOT_HIRE_COST, MECHANIC_HIRE_COST,
  PILOT_SALARY, MECHANIC_SALARY,
  maxPlanesStaffed, staffShortfall,
  crewUtilization, moraleLabel,
} from '../../systems/Personnel';

export class PersonnelScene extends RoomScene {
  constructor() { super('PersonnelScene'); this.title = 'Personnel — Crew'; }

  buildRoom() {
    const me = GameState.get().human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y, `Cash: ${formatMoney(me.cash)}`, 16, me.cash < 0 ? '#ff7b88' : COLORS.accentText);
    y += 30;

    // Summary
    const cap = maxPlanesStaffed(me);
    const shortfall = staffShortfall(me);
    const dailyPayroll = me.pilots * PILOT_SALARY + me.mechanics * MECHANIC_SALARY;
    this.addText(left, y, `Fleet: ${me.planes.length}    Staffed slots: ${cap}    Daily payroll: ${formatMoney(dailyPayroll)}`, 13);
    y += 22;
    if (shortfall > 0) {
      this.addText(left, y, `⚠ ${shortfall} plane(s) grounded — hire more crew.`, 13, '#ff9aa6');
    } else {
      this.addText(left, y, `All planes are crewed. Hire ahead of new aircraft purchases.`, 13, COLORS.textDim);
    }
    y += 30;

    // ===== Crew morale ==================================================
    const band = moraleLabel(me.morale);
    const util = crewUtilization(me);
    const utilLabel = util > 1.5 ? 'severely overworked'
                    : util > 1.0 ? 'overworked'
                    : util < 0.5 ? 'rested'
                    : 'balanced';
    this.addText(left, y, 'Crew morale', 18, COLORS.accentText);
    y += 26;
    // Morale bar — 240px wide, color-coded by band.
    const barX = left;
    const barY = y;
    const barW = 240;
    const barH = 14;
    const bgBar = this.add.rectangle(barX, barY, barW, barH, 0x1a2a3a).setOrigin(0);
    const fillW = Math.max(2, Math.round((me.morale / 100) * barW));
    const fillColor = Phaser.Display.Color.HexStringToColor(band.color).color;
    const fillBar = this.add.rectangle(barX, barY, fillW, barH, fillColor).setOrigin(0);
    this.content.add(bgBar);
    this.content.add(fillBar);
    this.addText(barX + barW + 14, barY - 1,
      `${Math.round(me.morale)} / 100 — ${band.label}`,
      14, band.color);
    y += barH + 8;
    this.addText(left, y, `Utilization: ${(util * 100).toFixed(0)}% (${utilLabel}) — active routes per pilot.`, 12, COLORS.textDim);
    y += 18;
    this.addText(left, y, '≥80 Energized: +3% load factor.   ≤40 Strained: −3% LF, more mishaps.   <30: crew may quit.', 11, COLORS.textDim);
    y += 30;

    // Pilots
    this.addText(left, y, 'Pilots', 18, COLORS.accentText);
    y += 26;
    this.addText(left, y, `Employed: ${me.pilots}    Hire: ${formatMoney(PILOT_HIRE_COST)}    Salary: ${formatMoney(PILOT_SALARY)} / day`, 13);
    y += 26;
    const hirePilotBtn = new Button({
      scene: this, x: left + 60, y: y + 12, width: 110, height: 28,
      label: 'Hire pilot',
      disabled: me.cash < PILOT_HIRE_COST,
      onClick: () => { if (hirePilot(me)) this.rebuild(); },
    });
    const firePilotBtn = new Button({
      scene: this, x: left + 180, y: y + 12, width: 110, height: 28,
      label: 'Fire pilot',
      disabled: me.pilots <= 0,
      onClick: () => { if (firePilot(me)) this.rebuild(); },
    });
    this.content.add(hirePilotBtn);
    this.content.add(firePilotBtn);

    y += 50;

    // Mechanics
    this.addText(left, y, 'Mechanics', 18, COLORS.accentText);
    y += 26;
    this.addText(left, y, `Employed: ${me.mechanics}    Hire: ${formatMoney(MECHANIC_HIRE_COST)}    Salary: ${formatMoney(MECHANIC_SALARY)} / day`, 13);
    y += 26;
    const hireMechBtn = new Button({
      scene: this, x: left + 60, y: y + 12, width: 110, height: 28,
      label: 'Hire mechanic',
      disabled: me.cash < MECHANIC_HIRE_COST,
      onClick: () => { if (hireMechanic(me)) this.rebuild(); },
    });
    const fireMechBtn = new Button({
      scene: this, x: left + 180, y: y + 12, width: 110, height: 28,
      label: 'Fire mechanic',
      disabled: me.mechanics <= 0,
      onClick: () => { if (fireMechanic(me)) this.rebuild(); },
    });
    this.content.add(hireMechBtn);
    this.content.add(fireMechBtn);

    y += 60;
    this.addText(left, y, 'Each plane needs 1 pilot AND 1 mechanic to fly. The cap = min(pilots, mechanics).', 12, COLORS.textDim);
  }
}
