import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { saveNow } from '../../systems/Save';

/**
 * In-game settings panel. Toggles persist with the save (GameSnapshot.settings).
 *
 * Gameplay settings live here rather than in the runtime sound/UI layer because
 * they directly alter dispatch behavior (skipping flights, holding for load
 * factor) and need to round-trip through saves.
 */
export class SettingsScene extends RoomScene {
  constructor() { super('SettingsScene'); this.title = 'Settings'; }

  buildRoom() {
    const settings = GameState.get().settings;
    const b = this.panelBounds;
    const left = b.x + 40;
    // All interactive controls right-align to this x — keeps labels free to grow.
    const rightEdge = b.x + b.w - 40;
    let y = b.y + 90;

    this.addText(left, y, 'Dispatch', 16, COLORS.accentText);
    y += 30;

    // -- Skip unprofitable flights --
    this.addText(left, y, 'Skip flights that would lose money', 14);
    this.addText(left + 8, y + 22,
      'When on, your planes stay parked instead of dispatching a flight whose estimated profit is negative.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.skipUnprofitable, (next) => {
      settings.skipUnprofitable = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- Min load factor for takeoff --
    const lfPct = Math.round(settings.minLoadFactorForTakeoff * 100);
    this.addText(left, y, `Wait for plane to fill: ${lfPct}% load factor minimum`, 14);
    this.addText(left + 8, y + 22,
      'Hold takeoffs until the route\'s expected load factor reaches this fraction. 0% disables the gate.',
      11, COLORS.textDim);
    const presets: Array<{ label: string; value: number }> = [
      { label: 'Off',  value: 0    },
      { label: '30%',  value: 0.30 },
      { label: '50%',  value: 0.50 },
      { label: '70%',  value: 0.70 },
    ];
    const btnW = 56;
    const gap = 6;
    // Right-align the preset cluster: rightmost button's right edge sits at
    // rightEdge, others march leftward.
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      const indexFromRight = presets.length - 1 - i;
      const cx = rightEdge - btnW / 2 - indexFromRight * (btnW + gap);
      const isActive = Math.abs(settings.minLoadFactorForTakeoff - p.value) < 0.001;
      const btn = new Button({
        scene: this,
        x: cx,
        y: y + 14,
        width: btnW,
        height: 26,
        label: p.label,
        bg: isActive ? 0x3d6a92 : 0x2d4a6a,
        onClick: () => {
          settings.minLoadFactorForTakeoff = p.value;
          saveNow();
          this.rebuild();
        },
      });
      this.content.add(btn);
    }
    y += 56;

    this.addText(left, y, 'Interface', 16, COLORS.accentText);
    y += 30;

    // -- Pause on room entry --
    this.addText(left, y, 'Auto-pause when entering a room', 14);
    this.addText(left + 8, y + 22,
      'Pause the world clock whenever you click into a room scene. Speed resumes when you leave.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.pauseOnRoomEntry, (next) => {
      settings.pauseOnRoomEntry = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    this.reportContentBottom(y);
  }

  /** Compact ON/OFF pill. `rightX` is the right edge the toggle should align to. */
  private addToggle(rightX: number, y: number, value: boolean, onChange: (next: boolean) => void) {
    const w = 80;
    const btn = new Button({
      scene: this,
      x: rightX - w / 2,
      y,
      width: w,
      height: 28,
      label: value ? 'ON' : 'OFF',
      bg: value ? 0x3d6a92 : 0x223046,
      bgHover: value ? 0x4a7da8 : 0x2d4a6a,
      textColor: value ? '#e8eef5' : '#9bb0c4',
      onClick: () => onChange(!value),
    });
    this.content.add(btn);
  }
}
