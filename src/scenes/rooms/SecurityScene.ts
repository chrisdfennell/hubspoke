import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { defenseRating, sabotageInventory, attemptSabotage } from '../../systems/Sabotage';
import { ITEMS } from '../../state/items';
import { Item } from '../../state/items';

export class SecurityScene extends RoomScene {
  /** UI state: which item the player is currently wielding (if any). */
  private armed: Item | null = null;

  constructor() { super('SecurityScene'); this.title = 'Security — Defense & Sabotage'; }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    // ---- Defense ----
    const def = defenseRating(me);
    this.addText(left, y, 'Defense', 18, COLORS.accentText);
    y += 26;
    this.addText(left, y, `Total defense rating: ${def}`, 14, def > 0 ? '#7be08a' : COLORS.text);
    y += 22;
    this.addText(left, y,
      def === 0
        ? 'You have no defenses. Buy CCTV / K-9 / Cyber Shield in Duty Free.'
        : 'Each 10 rating ≈ 8% chance to block incoming sabotage. Blocked attacks may consume one defense unit.',
      12, COLORS.textDim);
    y += 24;

    // List defense inventory
    let hasDefense = false;
    for (const item of ITEMS.filter(i => i.category === 'defense')) {
      const owned = me.inventory[item.id] ?? 0;
      if (owned > 0) {
        hasDefense = true;
        this.addText(left, y, `• ${item.name}: ${owned}  (rating ${item.defenseRating ?? 0} each)`, 13);
        y += 18;
      }
    }
    if (!hasDefense) {
      this.addText(left, y, '— no defense items deployed —', 12, COLORS.textDim);
      y += 18;
    }

    y += 20;

    // ---- Offense ----
    this.addText(left, y, 'Sabotage Operations', 18, COLORS.accentText);
    y += 26;

    const inv = sabotageInventory(me);
    if (inv.length === 0) {
      this.addText(left, y, 'You have no sabotage items. Buy them in Duty Free first.', 13, COLORS.textDim);
      return;
    }

    // Step 1: pick weapon
    this.addText(left, y, '1. Choose a sabotage tool:', 13);
    y += 22;
    let bx = left;
    for (const entry of inv) {
      const isArmed = this.armed?.id === entry.item.id;
      const labelW = Math.max(160, 24 + entry.item.name.length * 7);
      const btn = new Button({
        scene: this,
        x: bx + labelW / 2, y: y + 14, width: labelW, height: 28,
        label: `${isArmed ? '✓ ' : ''}${entry.item.name} (${entry.count})`,
        bg: isArmed ? 0x4a7a5e : 0x2d4a6a,
        bgHover: isArmed ? 0x5a8a6e : 0x3d6a92,
        onClick: () => {
          this.armed = isArmed ? null : entry.item;
          this.rebuild();
        },
      });
      this.content.add(btn);
      bx += labelW + 8;
      if (bx > b.x + b.w - 200) { bx = left; y += 36; }
    }
    y += 50;

    if (!this.armed) {
      this.addText(left, y, 'Select a tool above, then a target below.', 12, COLORS.textDim);
      return;
    }

    // Step 2: pick target
    this.addText(left, y, `2. Target a rival with ${this.armed.name}:`, 13);
    y += 22;
    const rivals = state.players.filter(p => p.id !== me.id && !state.takenOverBy[p.id]);

    for (const rival of rivals) {
      const rDef = defenseRating(rival);
      const blockChance = Math.min(80, rDef * 0.8); // %
      this.addText(left,        y + 6, rival.name, 14);
      this.addText(left + 200,  y + 6, `Rep ${Math.round(rival.reputation)}    Defense ${rDef}`, 12, COLORS.textDim);
      this.addText(left + 420,  y + 6, `~${Math.round(blockChance)}% blocked`, 12, COLORS.textDim);

      const btn = new Button({
        scene: this,
        x: left + 600, y: y + 14, width: 140, height: 28,
        label: 'Execute',
        onClick: () => {
          if (!this.armed) return;
          const result = attemptSabotage(me, rival, this.armed);
          state.gameEvents.unshift({
            id: `sab-${Date.now()}`,
            date: { ...state.date },
            severity: result.blocked ? 'bad' : 'neutral',
            headline: result.blocked
              ? `${rival.name} foils sabotage attempt`
              : `${rival.name} hit by sabotage`,
            body: `Internal investigation underway. ${result.effectSummary}`,
            impact: result.effectSummary,
          });
          state.pushNews(result.blocked
            ? `Sabotage on ${rival.name} blocked. ${result.detected ? 'Attacker exposed.' : ''}`
            : `${rival.name} sabotaged by you. ${result.effectSummary}`);
          this.armed = null;
          this.rebuild();
        },
      });
      this.content.add(btn);
      y += 30;
    }
  }
}
