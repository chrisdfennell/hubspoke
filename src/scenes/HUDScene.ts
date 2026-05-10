import Phaser from 'phaser';
import { GAME_WIDTH, COLORS } from '../config';
import { GameState } from '../state/GameState';
import { clock, formatDate, formatMoney } from '../systems/Clock';
import { staffShortfall } from '../systems/Personnel';
import { sound } from '../systems/Sound';
import { Tooltip } from '../ui/Tooltip';
import { creditLimit, effectiveLoanApr, SAVINGS_APY } from '../systems/Bank';
import { portfolioValue } from '../systems/Stocks';
import { DIFFICULTIES } from '../state/Difficulty';
import { netWorth, BILLIONAIRE_VICTORY, MILESTONES, Milestone } from '../systems/Milestones';
import { Modal } from '../ui/Modal';

export class HUDScene extends Phaser.Scene {
  private dateText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private fleetText!: Phaser.GameObjects.Text;
  private airlineText!: Phaser.GameObjects.Text;
  private tickerText!: Phaser.GameObjects.Text;
  private tickerHint!: Phaser.GameObjects.Text;
  private muteButton!: Phaser.GameObjects.Text;
  private tooltip!: Tooltip;
  /** How many news items were on the ticker last time we rebuilt it. */
  private lastTickerNewsCount = -1;
  /** Pixels per second the ticker scrolls. */
  private readonly TICKER_SPEED = 70;
  /** Milestones that have already had their celebration popup shown — seeded
   *  from the save on scene boot so reloading doesn't re-trigger them. */
  private celebratedMilestones: Set<string> = new Set();
  /** The currently-visible milestone popup, if any. Only one shown at a time. */
  private activeMilestonePopup: Phaser.GameObjects.Container | null = null;
  /** True while the cursor is over the news ticker — pauses scroll so the
   *  player can actually read a headline. */
  private tickerHovered = false;
  /** Last staff-shortfall value we already alerted the player about. We only
   *  pop the modal when the shortfall transitions 0→positive or grows — not
   *  every frame. Reset to 0 once the player resolves it so a future
   *  shortfall fires the alert again. */
  private lastShortfallAlerted = 0;

  constructor() { super({ key: 'HUDScene', active: false }); }

  create() {
    this.gameOverFired = false;

    // Top bar
    this.add.rectangle(0, 0, GAME_WIDTH, 44, 0x081523).setOrigin(0).setStrokeStyle(0);
    this.add.line(0, 44, 0, 0, GAME_WIDTH, 0, 0x88c0e0, 0.5).setOrigin(0);

    this.airlineText = this.add.text(16, 12, '', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '16px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    });

    this.moneyText = this.add.text(180, 12, '', { fontFamily: 'Segoe UI', fontSize: '16px', color: COLORS.text });
    this.fleetText = this.add.text(380, 14, '', { fontFamily: 'Segoe UI', fontSize: '13px', color: COLORS.textDim });
    this.dateText = this.add.text(GAME_WIDTH / 2, 12, '', { fontFamily: 'Segoe UI', fontSize: '16px', color: COLORS.text }).setOrigin(0.5, 0);

    // Tooltip used for the money + fleet + airline displays.
    this.tooltip = new Tooltip(this);
    this.tooltip.attach(this.moneyText, () => this.moneyTooltip());
    this.tooltip.attach(this.fleetText, () => this.fleetTooltip());
    this.tooltip.attach(this.airlineText, () => {
      const d = GameState.get().difficulty;
      const cfg = DIFFICULTIES[d];
      return `Difficulty: ${cfg.label}\n${cfg.tagline}`;
    });

    // Speed indicator + system buttons. Speed text right-aligns so it tucks
    // just left of the cluster; help (?), settings (⚙), and mute (🔊) sit on
    // the right.
    this.speedText = this.add
      .text(GAME_WIDTH - 310, 14, '', { fontFamily: 'Segoe UI', fontSize: '13px', color: COLORS.textDim })
      .setOrigin(1, 0);
    this.makeSpeedButton(GAME_WIDTH - 290, 22, '?', () => {
      this.scene.pause('AirportScene');
      this.scene.launch('HelpScene');
    });
    this.makeSpeedButton(GAME_WIDTH - 250, 22, '||', () => { GameState.get().paused = !GameState.get().paused; });
    this.makeSpeedButton(GAME_WIDTH - 210, 22, '1x', () => { GameState.get().paused = false; GameState.get().speed = 1; });
    this.makeSpeedButton(GAME_WIDTH - 170, 22, '2x', () => { GameState.get().paused = false; GameState.get().speed = 2; });
    this.makeSpeedButton(GAME_WIDTH - 130, 22, '4x', () => { GameState.get().paused = false; GameState.get().speed = 4; });
    this.makeSpeedButton(GAME_WIDTH - 90,  22, '⚙',  () => {
      // Open settings without pausing AirportScene from underneath; if the
      // player is already in a room, the settings panel renders on top.
      this.scene.pause('AirportScene');
      this.scene.launch('SettingsScene');
    });
    this.muteButton = this.makeSpeedButton(GAME_WIDTH - 50, 22, sound.isMuted() ? '🔇' : '🔊', () => {
      sound.toggleMuted();
      this.muteButton.setText(sound.isMuted() ? '🔇' : '🔊');
    });

    // News ticker on bottom — scrolling marquee, click to open News Stand.
    const tickerY = this.scale.height - 28;
    const tickerBg = this.add.rectangle(0, tickerY, GAME_WIDTH, 28, 0x081523).setOrigin(0);
    this.add.line(0, tickerY, 0, 0, GAME_WIDTH, 0, 0x88c0e0, 0.5).setOrigin(0);

    // Hint label on the right edge invites clicking. Static, drawn over the ticker.
    this.tickerHint = this.add.text(GAME_WIDTH - 12, tickerY + 6, 'click for News ›', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '11px',
      color: '#88c0e0',
      backgroundColor: '#081523',
      padding: { left: 6, right: 6, top: 1, bottom: 1 },
    }).setOrigin(1, 0);

    // Scrolling text starts off-screen right.
    this.tickerText = this.add.text(GAME_WIDTH, tickerY + 6, '', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color: COLORS.textDim,
    });

    tickerBg.setInteractive({ useHandCursor: true });
    tickerBg.on('pointerover', () => {
      this.tickerText.setColor('#e8eef5');
      this.tickerHovered = true;
    });
    tickerBg.on('pointerout', () => {
      this.tickerText.setColor(COLORS.textDim);
      this.tickerHovered = false;
    });
    tickerBg.on('pointerdown', () => {
      this.scene.pause('AirportScene');
      this.scene.launch('NewsScene');
    });

    this.refresh();
    this.refreshTickerContent();

    // Seed the celebrated set from what's already in the save so a reload
    // doesn't re-fire popups for milestones the player has already seen.
    this.celebratedMilestones = new Set(GameState.get().milestonesReached);
  }

  private makeSpeedButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const w = 32, h = 24;
    const r = this.add.rectangle(x, y, w, h, 0x14304a).setStrokeStyle(1, 0x88c0e0);
    const t = this.add.text(x, y, label, { fontFamily: 'Segoe UI', fontSize: '12px', color: COLORS.text }).setOrigin(0.5);
    r.setInteractive({ useHandCursor: true });
    r.on('pointerover', () => r.setFillStyle(0x2a5780));
    r.on('pointerout', () => r.setFillStyle(0x14304a));
    r.on('pointerdown', onClick);
    return t;
  }

  update(_t: number, dt: number) {
    clock.update(dt);
    this.refresh();
    this.tickTicker(dt);
    this.checkGameOver();
    this.checkNewMilestones();
  }

  /** If a milestone was crossed since we last looked, show its celebration. */
  private checkNewMilestones() {
    if (this.activeMilestonePopup) return;        // one popup at a time
    const reached = GameState.get().milestonesReached;
    for (const id of reached) {
      if (this.celebratedMilestones.has(id)) continue;
      const m = MILESTONES.find(x => x.id === id);
      if (!m) {
        this.celebratedMilestones.add(id);
        continue;
      }
      this.celebratedMilestones.add(id);
      this.showMilestonePopup(m);
      return;
    }
  }

  /** Center-screen celebratory toast. Tweens in, dismissed by clicking
   *  Continue (or pressing Enter / Esc). */
  private showMilestonePopup(m: Milestone) {
    const w = 560, h = 220;
    const cx = GAME_WIDTH / 2;
    const cy = this.scale.height / 2;

    const container = this.add.container(cx, cy)
      .setDepth(20_000)
      .setScale(0.85)
      .setAlpha(0);

    const bg = this.add.rectangle(0, 0, w, h, 0x0b1a2c, 0.97)
      .setStrokeStyle(3, 0xffc857);
    const accent = this.add.rectangle(0, -h / 2 + 6, w, 12, 0xffc857)
      .setStrokeStyle(0);
    const star = this.add.text(0, -h / 2 + 38, '★', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '36px',
      color: '#ffc857',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const heading = this.add.text(0, -10, 'MILESTONE REACHED', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '14px',
      color: '#9bb0c4',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const label = this.add.text(0, 18, m.label, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: w - 40 },
    }).setOrigin(0.5);
    const flavor = this.add.text(0, 56, m.flavor ?? '', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color: '#cbd6e3',
      align: 'center',
      wordWrap: { width: w - 40 },
    }).setOrigin(0.5);

    container.add([bg, accent, star, heading, label, flavor]);

    const dismiss = () => {
      if (this.activeMilestonePopup !== container) return;
      this.tweens.add({
        targets: container,
        alpha: 0,
        scale: 0.85,
        duration: 200,
        ease: 'Sine.easeIn',
        onComplete: () => {
          container.destroy(true);
          if (this.activeMilestonePopup === container) this.activeMilestonePopup = null;
        },
      });
    };

    const button = this.add.rectangle(0, h / 2 - 32, 160, 36, 0x2d4a6a)
      .setStrokeStyle(2, 0xffc857)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(0, h / 2 - 32, 'Continue', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '14px',
      color: '#e8eef5',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    button.on('pointerover', () => button.setFillStyle(0x3d6a92));
    button.on('pointerout',  () => button.setFillStyle(0x2d4a6a));
    button.on('pointerdown', dismiss);
    container.add([button, buttonText]);

    this.input.keyboard?.once('keydown-ENTER', dismiss);
    this.input.keyboard?.once('keydown-ESC',   dismiss);

    this.activeMilestonePopup = container;
    sound.play('buy');
    this.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut',
    });
  }

  /** Rebuild the ticker text from the latest N news entries, gated by the
   *  ticker-category toggles in Settings. lastTickerNewsCount intentionally
   *  tracks the *unfiltered* news count so that newly-pushed items still
   *  trigger a re-roll even if they get filtered out — keeps the marquee
   *  from going stale when only-rivals or only-mine flips on. */
  private refreshTickerContent() {
    const state = GameState.get();
    const all = state.news.slice(0, 30);
    this.lastTickerNewsCount = all.length;
    const meName = state.human.name;
    const s = state.settings;
    const visible = all.filter(n => {
      const c = HUDScene.classifyNews(n.text, meName);
      if (c === 'milestone') return true;
      if (c === 'mine')   return s.showMineNews;
      if (c === 'rival')  return s.showRivalNews;
      /* event */         return s.showEventNews;
    });
    if (visible.length === 0) {
      const msg = all.length === 0
        ? '📰  No news yet — quiet skies.'
        : '📰  All news filtered — adjust ticker toggles in Settings.';
      this.tickerText.setText(msg);
    } else {
      const sep = '   •   ';
      this.tickerText.setText(`📰  ${visible.map(n => n.text).join(sep)}${sep}`);
    }
    this.tickerText.x = GAME_WIDTH;
  }

  /** Heuristic newsroom classifier. We don't tag news entries at push time
   *  (every call site would need updating), so we infer the category from
   *  the headline prefix and whether the human's airline name appears. */
  private static classifyNews(text: string, myName: string): 'mine' | 'rival' | 'event' | 'milestone' {
    if (text.startsWith('★')) return 'milestone';
    if (text.startsWith('⚠') || text.startsWith('✦') || text.startsWith('·')) return 'event';
    if (text.includes(myName)) return 'mine';
    return 'rival';
  }

  /** Scroll the ticker text leftward; restart when fully off-screen. Pauses
   *  while the cursor hovers the ticker so the player can finish reading a
   *  headline before deciding to click through to the News Stand. */
  private tickTicker(dt: number) {
    // Rebuild text if a new news item arrived (so the latest enters the marquee).
    const currentCount = GameState.get().news.length;
    if (currentCount !== this.lastTickerNewsCount && this.tickerText.x < -this.tickerText.width / 2) {
      this.refreshTickerContent();
      return;
    }
    if (this.tickerHovered) return;
    this.tickerText.x -= this.TICKER_SPEED * (dt / 1000);
    if (this.tickerText.x + this.tickerText.width < 0) {
      this.refreshTickerContent();
    }
  }

  private gameOverFired = false;

  private checkGameOver() {
    if (this.gameOverFired) return;
    const s = GameState.get();
    const human = s.human;

    // Defeat: human taken over.
    if (s.takenOverBy[human.id]) {
      const acquirerId = s.takenOverBy[human.id];
      const acquirer = s.players.find(p => p.id === acquirerId);
      this.fireGameOver('defeat', `${acquirer?.name ?? 'A rival'} acquired your airline. Game over.`);
      return;
    }

    // Bankruptcy: cash deeply negative AND can't borrow more (loan ≥ floor).
    if (human.cash < -5_000_000 && human.loan >= 50_000_000) {
      this.fireGameOver('bankruptcy', `${human.name} has gone bankrupt. Cash: ${formatMoney(human.cash)} · Loan: ${formatMoney(human.loan)}`);
      return;
    }

    // Victory by net worth: build up to a billion.
    const nw = netWorth(human);
    if (nw >= BILLIONAIRE_VICTORY) {
      this.fireGameOver('victory', `${human.name} reached ${formatMoney(nw)} net worth — a billion-dollar empire.`);
      return;
    }

    // Victory: every rival has been taken over (by anyone, doesn't have to be you,
    // but as long as you're standing among the unaquired you've effectively won).
    const livingRivals = s.players.filter(p => p.id !== human.id && !s.takenOverBy[p.id]);
    if (livingRivals.length === 0 && s.players.length > 1) {
      this.fireGameOver('victory', `All rivals eliminated. ${human.name} dominates the skies.`);
    }
  }

  private fireGameOver(reason: 'victory' | 'defeat' | 'bankruptcy', message: string) {
    this.gameOverFired = true;
    GameState.get().paused = true;
    sound.play('gameOver');
    this.scene.launch('GameOverScene', { reason, message });
  }

  /** Money breakdown: cash, savings, loan, daily interest, portfolio, net worth. */
  private moneyTooltip(): string {
    const me = GameState.get().human;
    const dailyLoanInterest = me.loan * (effectiveLoanApr() / 360);
    const dailySavingsYield = me.savings * (SAVINGS_APY / 360);
    const portfolio = portfolioValue(me);
    const netWorth = me.cash + me.savings + portfolio - me.loan;
    const lines = [
      `Cash:       ${formatMoney(me.cash)}`,
      `Savings:    ${formatMoney(me.savings)}   (+${formatMoney(dailySavingsYield)} / day)`,
      `Loan:       ${formatMoney(me.loan)}   (-${formatMoney(dailyLoanInterest)} / day)`,
      `Credit ceiling: ${formatMoney(creditLimit(me))}`,
      `Portfolio:  ${formatMoney(portfolio)}`,
      ``,
      `Net worth:  ${formatMoney(netWorth)}`,
    ];
    return lines.join('\n');
  }

  /** Fleet breakdown: counts by status, staffing cap, daily payroll burden. */
  private fleetTooltip(): string {
    const me = GameState.get().human;
    const counts = { idle: 0, flying: 0, cargo: 0, maintenance: 0, ferry: 0 };
    for (const p of me.planes) counts[p.status.kind]++;
    const cap = Math.min(me.pilots, me.mechanics);
    const shortfall = staffShortfall(me);
    const lines: string[] = [
      `Fleet of ${me.planes.length}:`,
      `  Idle: ${counts.idle}   Flying: ${counts.flying}   Cargo: ${counts.cargo}   Maint: ${counts.maintenance}`,
      `Crew: ${me.pilots} pilots, ${me.mechanics} mechanics  (cap ${cap})`,
    ];
    if (shortfall > 0) lines.push(`⚠ ${shortfall} plane(s) grounded — hire crew in Personnel`);
    lines.push(`Reputation: ${Math.round(me.reputation)} / 100`);
    return lines.join('\n');
  }

  private refresh() {
    const s = GameState.get();
    this.airlineText.setText(s.human.name);
    this.dateText.setText(formatDate(s.date));
    this.moneyText.setText(formatMoney(s.human.cash));
    this.moneyText.setColor(s.human.cash < 0 ? '#ff7b88' : COLORS.text);
    const shortfall = staffShortfall(s.human);
    const base = `Fleet: ${s.human.planes.length}   Routes: ${s.human.routes.length}   Rep: ${Math.round(s.human.reputation)}`;
    if (shortfall > 0) {
      // Short inline indicator — full instruction lives in the popup + the
      // fleet-text tooltip, so the top bar doesn't overflow into the date
      // strip in the middle of the HUD.
      this.fleetText.setText(`${base}   ⚠ ${shortfall} grounded`);
      this.fleetText.setColor('#ff9aa6');
    } else {
      this.fleetText.setText(base);
      this.fleetText.setColor(COLORS.textDim);
    }

    // Pop a confirmable alert when staff shortfall first appears or grows.
    // We only fire on the rising edge so the modal doesn't reappear every
    // frame the issue persists. Reset on resolution so a future shortfall
    // alerts again.
    if (shortfall > this.lastShortfallAlerted) {
      Modal.alert(this, {
        title: 'Crew Shortage',
        message:
          `${shortfall} of your plane${shortfall === 1 ? '' : 's'} ` +
          `${shortfall === 1 ? 'is' : 'are'} grounded because you don't have ` +
          `enough pilots and mechanics on staff.\n\n` +
          `Visit the Personnel room to hire more crew.`,
        ok: 'Got it',
      });
    }
    this.lastShortfallAlerted = shortfall;
    const speedLabel = s.paused ? 'PAUSED' : `Speed ${s.speed}x`;
    this.speedText.setText(speedLabel);
  }
}
