import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { formatDate } from '../../systems/Clock';
import { GameEvent } from '../../systems/Events';

export class NewsScene extends RoomScene {
  constructor() { super('NewsScene'); this.title = 'News Stand — Industry Briefing'; }

  buildRoom() {
    const state = GameState.get();
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    if (state.gameEvents.length === 0) {
      this.addText(left, y, 'No recent events. Check back tomorrow.', 14, COLORS.textDim);
      return;
    }

    this.addText(left, y, `Showing the last ${state.gameEvents.length} event(s) — newest first.`, 12, COLORS.textDim);
    y += 28;

    for (const ev of state.gameEvents) {
      const color = severityColor(ev.severity);
      // Date stamp
      this.addText(left, y, formatDate(ev.date), 11, COLORS.textDim);
      // Headline
      this.addText(left + 110, y, ev.headline, 15, color);
      y += 22;
      // Body
      this.addText(left + 110, y, wrap(ev.body, 90), 13, COLORS.text);
      y += 22 + countLines(ev.body, 90) * 16;
      // Impact
      this.addText(left + 110, y, `Impact: ${ev.impact}`, 12, COLORS.textDim);
      y += 28;
    }
  }
}

function severityColor(s: GameEvent['severity']): string {
  if (s === 'good') return '#7be08a';
  if (s === 'bad')  return '#ff9aa6';
  return COLORS.accentText;
}

function wrap(text: string, cols: number): string {
  // Simple word-wrap to a column count.
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > cols) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

function countLines(text: string, cols: number): number {
  return wrap(text, cols).split('\n').length;
}
