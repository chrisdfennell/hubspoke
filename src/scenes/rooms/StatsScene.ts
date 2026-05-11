import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { formatMoney } from '../../systems/Clock';
import { netWorth } from '../../systems/Milestones';
import { renderStatsBlock } from '../../ui/StatsBlock';
import {
  ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, Achievement, isUnlocked,
} from '../../state/achievements';
import { checkAchievements } from '../../systems/Milestones';

/**
 * Career stats panel — opened from the bar icon next to the `?` help
 * button. Shared layout with the game-over screen so the player sees
 * a familiar shape on either side of the run's end.
 */
export class StatsScene extends RoomScene {
  constructor() { super('StatsScene'); this.title = 'Career Stats'; }

  buildRoom() {
    // Re-evaluate achievements when the player opens Stats so newly-
    // crossed thresholds get their news entry + celebration immediately
    // rather than waiting for the next clock.onDay fire. Idempotent —
    // already-unlocked ids are skipped.
    checkAchievements();
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 40;
    let y = b.y + 80;

    this.addText(left, y, `${me.name}`, 18, COLORS.accentText);
    y += 26;
    this.addText(left, y,
      `Current net worth: ${formatMoney(netWorth(me))}  ·  Cash: ${formatMoney(me.cash)}  ·  Reputation: ${Math.round(me.reputation)}`,
      12, COLORS.textDim);
    y += 28;

    y = renderStatsBlock(this, left, y, state.stats, this.content);
    y += 24;

    y = this.renderAchievements(left, y);
    this.reportContentBottom(y);
  }

  // ----- Achievements -----

  private renderAchievements(left: number, startY: number): number {
    const state = GameState.get();
    // Use the live `isUnlocked` check rather than the persisted set so the
    // visual is accurate the instant a threshold is crossed — the persisted
    // set is what gates news/popup firing, not what the row should display.
    let y = startY;

    const totalDone = ACHIEVEMENTS.filter(a => isUnlocked(a, state)).length;
    this.addText(left, y, `Achievements  (${totalDone} / ${ACHIEVEMENTS.length})`, 18, COLORS.accentText);
    y += 28;

    for (const cat of ACHIEVEMENT_CATEGORIES) {
      const inCat = ACHIEVEMENTS.filter(a => a.category === cat.id);
      if (inCat.length === 0) continue;
      const doneInCat = inCat.filter(a => isUnlocked(a, state)).length;
      this.addText(left, y, `${cat.label}  (${doneInCat} / ${inCat.length})`, 14, COLORS.accentText);
      y += 22;
      for (const a of inCat) {
        y = this.drawAchievementRow(a, state, isUnlocked(a, state), left + 12, y);
      }
      y += 10;
    }
    return y;
  }

  private drawAchievementRow(
    a: Achievement,
    state: GameState,
    isDone: boolean,
    x: number,
    y: number,
  ): number {
    const rowH = 38;
    const rowW = 760;
    // Subtle row background — slightly brighter when unlocked so the eye
    // picks out completed achievements scanning the list.
    const bg = isDone ? 0x163a26 : 0x142036;
    const stroke = isDone ? 0x4a7a5e : 0x335577;
    this.content.add(this.add.rectangle(x + rowW / 2, y + rowH / 2, rowW, rowH, bg)
      .setStrokeStyle(1, stroke));

    // Medal icon — slightly desaturated for locked ones via alpha.
    const iconText = this.addText(x + 8, y + 8, a.icon, 22, '#ffffff');
    iconText.setAlpha(isDone ? 1 : 0.4);

    // Name + description on the left side.
    const nameColor = isDone ? '#ffd44a' : COLORS.text;
    this.addText(x + 44, y + 4, a.name, 13, nameColor);
    this.addText(x + 44, y + 22, a.description, 11, COLORS.textDim);

    // Right side: ✓ check + label OR progress bar + count.
    if (isDone) {
      this.addText(x + rowW - 110, y + 12, '✓ Unlocked', 13, '#7be08a');
    } else {
      const cur = a.progress(state);
      const pct = Math.max(0, Math.min(1, cur / a.target));
      const barX = x + rowW - 230;
      const barY = y + 24;
      const barW = 200;
      const barH = 6;
      this.content.add(this.add.rectangle(barX, barY, barW, barH, 0x223046).setOrigin(0));
      this.content.add(this.add.rectangle(barX, barY, barW * pct, barH, 0xffc857).setOrigin(0));
      const label = `${formatProgressValue(cur, a.valueKind)} / ${formatProgressValue(a.target, a.valueKind)}`;
      this.addText(barX, y + 4, label, 11, COLORS.textDim);
    }

    return y + rowH + 4;
  }
}

/** Pretty-print a counter using the achievement's declared `valueKind`. */
function formatProgressValue(v: number, kind: 'count' | 'money' | undefined): string {
  if (kind === 'money') return formatMoney(v);
  return Math.floor(v).toLocaleString('en-US');
}
