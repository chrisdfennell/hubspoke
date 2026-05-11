import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { formatMoney } from '../../systems/Clock';
import { netWorth } from '../../systems/Milestones';
import { renderStatsBlock } from '../../ui/StatsBlock';

/**
 * Career stats panel — opened from the bar icon next to the `?` help
 * button. Shared layout with the game-over screen so the player sees
 * a familiar shape on either side of the run's end.
 */
export class StatsScene extends RoomScene {
  constructor() { super('StatsScene'); this.title = 'Career Stats'; }

  buildRoom() {
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
    this.reportContentBottom(y);
  }
}
