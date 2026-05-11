import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatDate } from '../../systems/Clock';
import { GameEvent } from '../../systems/Events';

type TabId = 'voices' | 'headlines' | 'events';

export class NewsScene extends RoomScene {
  private tab: TabId = 'voices';

  constructor() { super('NewsScene'); this.title = 'News Stand — Industry Briefing'; }

  buildRoom() {
    this.drawTabBar();
    switch (this.tab) {
      case 'voices':    this.buildVoices(); break;
      case 'headlines': this.buildHeadlines(); break;
      case 'events':    this.buildEvents(); break;
    }
  }

  private drawTabBar() {
    const b = this.panelBounds;
    const tabs: { id: TabId; label: string }[] = [
      { id: 'voices',    label: 'Passenger Voices' },
      { id: 'headlines', label: 'Headlines' },
      { id: 'events',    label: 'World Events' },
    ];
    let x = b.x + 30;
    const y = b.y + 80;
    for (const t of tabs) {
      const isActive = t.id === this.tab;
      const w = 150;
      const btn = new Button({
        scene: this,
        x: x + w / 2, y, width: w, height: 30,
        label: t.label,
        bg: isActive ? 0x4a7a5e : 0x1a3450,
        bgHover: isActive ? 0x5a8a6e : 0x2a5780,
        onClick: () => {
          if (this.tab === t.id) return;
          this.tab = t.id;
          this.scrollTo(0);
          this.rebuild();
        },
      });
      this.content.add(btn);
      x += w + 4;
    }
  }

  // ----- Passenger Voices: every 💬-prefixed item from state.news -----
  private buildVoices() {
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 130;

    const voices = GameState.get().news.filter(n => n.text.startsWith('💬'));
    if (voices.length === 0) {
      this.addText(left, y,
        'No passenger feedback yet. Quotes drop after revenue arrivals — fly a few routes and check back.',
        13, COLORS.textDim);
      return;
    }

    this.addText(left, y,
      `Showing the last ${voices.length} passenger ${voices.length === 1 ? 'comment' : 'comments'} — newest first.`,
      12, COLORS.textDim);
    y += 28;

    for (const item of voices) {
      // Strip the 💬 prefix — the section already labels these as voices.
      const text = item.text.replace(/^💬\s*/, '');
      this.addText(left, y, formatDate(item.date), 11, COLORS.textDim);
      this.addText(left + 110, y, text, 13, COLORS.text);
      y += 22 + wrapLines(text, 100) * 14;
    }
  }

  // ----- Headlines: everything in state.news that ISN'T a 💬 quote -----
  private buildHeadlines() {
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 130;

    const headlines = GameState.get().news.filter(n => !n.text.startsWith('💬'));
    if (headlines.length === 0) {
      this.addText(left, y, 'No headlines yet. Quiet skies.', 13, COLORS.textDim);
      return;
    }

    this.addText(left, y,
      `Showing the last ${headlines.length} ${headlines.length === 1 ? 'headline' : 'headlines'} — newest first.`,
      12, COLORS.textDim);
    y += 28;

    for (const item of headlines) {
      this.addText(left, y, formatDate(item.date), 11, COLORS.textDim);
      this.addText(left + 110, y, item.text, 13, COLORS.text);
      y += 22 + wrapLines(item.text, 100) * 14;
    }
  }

  // ----- World Events: structured event log (original content) -----
  private buildEvents() {
    const state = GameState.get();
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 130;

    if (state.gameEvents.length === 0) {
      this.addText(left, y, 'No recent world events. Check back tomorrow.', 14, COLORS.textDim);
      return;
    }

    this.addText(left, y, `Showing the last ${state.gameEvents.length} event(s) — newest first.`, 12, COLORS.textDim);
    y += 28;

    for (const ev of state.gameEvents) {
      const color = severityColor(ev.severity);
      this.addText(left, y, formatDate(ev.date), 11, COLORS.textDim);
      this.addText(left + 110, y, ev.headline, 15, color);
      y += 22;
      this.addText(left + 110, y, wrap(ev.body, 90), 13, COLORS.text);
      y += 22 + countLines(ev.body, 90) * 16;
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

/** Approx lines a single string will occupy at the given column width.
 *  Used to advance the y-cursor enough for the next row. */
function wrapLines(text: string, cols: number): number {
  return Math.max(1, Math.ceil(text.length / cols));
}
