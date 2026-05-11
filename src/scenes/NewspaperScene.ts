import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { WeeklyPaper } from '../systems/Newspaper';
import { formatMoney } from '../systems/Clock';
import { getCity } from '../state/catalog';
import { Button } from '../ui/Button';

function cityShort(id: string): string {
  return getCity(id).name;
}

/**
 * Weekly newspaper modal. Launched from HUDScene when the Newspaper system
 * decides today is a paper day. Pauses HUDScene so the in-game clock stops
 * while the player reads, resumes it on dismiss.
 *
 * Visual: cream paper-styled panel over a dark backdrop. Three sections —
 * Headlines (the week's non-passenger news), The Week in Numbers (stat
 * deltas), Letters to the Editor (💬 passenger quotes). Continue button +
 * ESC both dismiss.
 */
export class NewspaperScene extends Phaser.Scene {
  private paper!: WeeklyPaper;
  private escKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'NewspaperScene', active: false });
  }

  init(data: { paper: WeeklyPaper }) {
    this.paper = data.paper;
  }

  create() {
    this.scene.pause('HUDScene');

    // Full-screen dark backdrop. Marked interactive so clicks on it (anywhere
    // outside the paper) don't fall through to the airport/room behind.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0)
      .setInteractive();

    // Paper panel.
    const panelW = 720;
    const panelH = 650;
    const panelX = (GAME_WIDTH - panelW) / 2;
    const panelY = (GAME_HEIGHT - panelH) / 2;
    const cream = 0xece5d3;
    const ink = '#1a1612';
    const inkDim = '#4a4640';
    const accent = '#801616';

    this.add
      .rectangle(panelX, panelY, panelW, panelH, cream)
      .setOrigin(0)
      .setStrokeStyle(2, 0x3a342a);

    // ---- Masthead ----
    const cx = panelX + panelW / 2;
    this.add.text(cx, panelY + 24, 'THE HUB & SPOKE TIMES', {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '28px',
      color: ink,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.add.text(cx, panelY + 58, this.subhead(), {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '13px',
      color: inkDim,
      fontStyle: 'italic',
    }).setOrigin(0.5, 0);

    // Horizontal rule under the masthead.
    this.add.rectangle(panelX + 40, panelY + 84, panelW - 80, 2, 0x3a342a).setOrigin(0);

    // ---- Sections ----
    const contentX = panelX + 40;
    const contentW = panelW - 80;
    let y = panelY + 100;

    y = this.renderHeadlines(contentX, y, contentW, ink, accent);
    y += 14;
    y = this.renderNumbers(contentX, y, contentW, ink, accent);
    y += 14;
    y = this.renderSponsors(contentX, y, contentW, ink, inkDim, accent);
    y = this.renderLetters(contentX, y, contentW, ink, inkDim, accent);

    // ---- Continue button + ESC hint ----
    new Button({
      scene: this,
      x: cx,
      y: panelY + panelH - 36,
      width: 200,
      height: 40,
      label: 'Continue',
      bg: 0x801616,
      bgHover: 0xa12020,
      textColor: '#f4ecdc',
      onClick: () => this.dismiss(),
    });

    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey?.on('down', () => this.dismiss());
    this.input.keyboard?.on('keydown-ENTER', () => this.dismiss());
  }

  private subhead(): string {
    const s = this.paper.weekStartDate;
    const e = this.paper.weekEndDate;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `Week of ${s.year}-${pad(s.month)}-${pad(s.day)} – ${e.year}-${pad(e.month)}-${pad(e.day)}`;
  }

  private renderHeadlines(x: number, y: number, w: number, ink: string, accent: string): number {
    this.add.text(x, y, 'HEADLINES', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: accent,
      fontStyle: 'bold',
    });
    y += 22;

    if (this.paper.headlines.length === 0) {
      this.add.text(x, y, 'Quiet week. No news worth printing.', {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: ink,
        fontStyle: 'italic',
      });
      return y + 18;
    }

    for (const item of this.paper.headlines) {
      const t = this.add.text(x, y, `• ${item.text}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: ink,
        wordWrap: { width: w },
      });
      y += t.height + 4;
    }
    return y;
  }

  private renderNumbers(x: number, y: number, w: number, ink: string, accent: string): number {
    this.add.text(x, y, 'THE WEEK IN NUMBERS', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: accent,
      fontStyle: 'bold',
    });
    y += 22;

    const p = this.paper;
    const colW = w / 2;
    const rows: Array<[string, string, string, string]> = [
      [
        'Flights',     p.flights.toLocaleString('en-US'),
        'Revenue',     formatMoney(p.revenue),
      ],
      [
        'Passengers',  p.passengers.toLocaleString('en-US'),
        'Fuel',        formatMoney(p.fuel),
      ],
      [
        'Reputation',  `${p.reputationEnd.toFixed(0)}  (${signed(p.reputationDelta, 1)})`,
        'Cash',        `${formatMoney(p.cashEnd)}  (${signedMoney(p.cashDelta)})`,
      ],
      [
        'Net worth',   `${formatMoney(p.netWorthEnd)}  (${signedMoney(p.netWorthDelta)})`,
        '',            '',
      ],
    ];

    for (const [k1, v1, k2, v2] of rows) {
      this.add.text(x,            y, k1, { fontFamily: 'Georgia, serif', fontSize: '12px', color: ink, fontStyle: 'bold' });
      this.add.text(x + 100,      y, v1, { fontFamily: 'Georgia, serif', fontSize: '12px', color: ink });
      if (k2) {
        this.add.text(x + colW,        y, k2, { fontFamily: 'Georgia, serif', fontSize: '12px', color: ink, fontStyle: 'bold' });
        this.add.text(x + colW + 100,  y, v2, { fontFamily: 'Georgia, serif', fontSize: '12px', color: ink });
      }
      y += 18;
    }
    return y;
  }

  private renderSponsors(x: number, y: number, w: number, ink: string, inkDim: string, accent: string): number {
    const { sponsorActive, sponsorResolved, sponsorOffers } = this.paper;
    if (sponsorActive.length === 0 && sponsorResolved.length === 0 && sponsorOffers.length === 0) {
      return y;
    }

    this.add.text(x, y, 'SPONSOR WATCH', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: accent,
      fontStyle: 'bold',
    });
    y += 22;

    // Resolved (★/⚠) get a one-line summary each.
    for (const s of sponsorResolved.slice(0, 3)) {
      const marker = s.status === 'completed' ? '★'
                   : s.status === 'failed'    ? '⚠'
                   :                            '·';
      const verb = s.status === 'completed' ? 'fulfilled'
                 : s.status === 'failed'    ? 'failed'
                 :                            'expired';
      this.add.text(x, y, `${marker} ${s.brand} contract ${verb} (→ ${cityShort(s.toCity)}).`, {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: ink,
      });
      y += 18;
    }

    // Active progress lines.
    for (const s of sponsorActive.slice(0, 3)) {
      const pct = Math.min(100, Math.round((s.progress / s.target) * 100));
      this.add.text(x, y,
        `In progress — ${s.brand}: ${s.progress.toLocaleString('en-US')} / ${s.target.toLocaleString('en-US')} pax to ${cityShort(s.toCity)} (${pct}%).`, {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: ink,
      });
      y += 18;
    }

    // Available offers ping.
    for (const s of sponsorOffers.slice(0, 2)) {
      this.add.text(x, y, `New offer — ${s.brand} ${s.pitch} to ${cityShort(s.toCity)} (Office → Sponsors).`, {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: inkDim,
        fontStyle: 'italic',
      });
      y += 18;
    }

    return y + 14;
  }

  private renderLetters(x: number, y: number, w: number, ink: string, inkDim: string, accent: string): number {
    this.add.text(x, y, 'LETTERS TO THE EDITOR', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: accent,
      fontStyle: 'bold',
    });
    y += 22;

    if (this.paper.letters.length === 0) {
      this.add.text(x, y, 'No correspondence this week.', {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: inkDim,
        fontStyle: 'italic',
      });
      return y + 18;
    }

    for (const item of this.paper.letters) {
      // Strip the 💬 prefix — the paper layout already labels these as letters.
      const text = item.text.replace(/^💬\s*/, '');
      const t = this.add.text(x + 12, y, text, {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: ink,
        fontStyle: 'italic',
        wordWrap: { width: w - 12 },
      });
      y += t.height + 4;
    }
    return y;
  }

  private dismiss() {
    this.scene.resume('HUDScene');
    this.scene.stop();
  }
}

function signed(n: number, digits = 0): string {
  if (n >= 0.05) return `▲ ${n.toFixed(digits)}`;
  if (n <= -0.05) return `▼ ${Math.abs(n).toFixed(digits)}`;
  return '—';
}

function signedMoney(n: number): string {
  if (Math.round(n) === 0) return '—';
  const arrow = n > 0 ? '▲' : '▼';
  return `${arrow} ${formatMoney(Math.abs(n))}`;
}
