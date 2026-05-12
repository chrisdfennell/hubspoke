import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { makePlaneIcon } from '../ui/PlaneIcon';
import { sound } from '../systems/Sound';

const INTRO_SEEN_KEY = 'hub-and-spoke-intro-seen';

export function hasSeenIntro(): boolean {
  return localStorage.getItem(INTRO_SEEN_KEY) === '1';
}
export function markIntroSeen() {
  localStorage.setItem(INTRO_SEEN_KEY, '1');
}

interface IntroData {
  /** When true, intro plays even if the seen-flag is set. Used by the
   *  "Replay intro" button in Settings. */
  replay?: boolean;
}

/**
 * Dawn Takeoff cinematic — plays once on first launch, replayable from
 * Settings. Four storyboarded phases (~15s total): pre-dawn airport →
 * sunrise + Cessna takeoff → network of routes spider out across a stylized
 * world → title card. Skippable on any pointerdown / keypress.
 */
export class IntroScene extends Phaser.Scene {
  private replayMode = false;
  private finished = false;
  private sky!: Phaser.GameObjects.Rectangle;
  private skyOverlay!: Phaser.GameObjects.Rectangle;
  private worldLayer!: Phaser.GameObjects.Container;
  private titleLayer!: Phaser.GameObjects.Container;
  private skipHint!: Phaser.GameObjects.Text;
  private clickBlocker!: Phaser.GameObjects.Rectangle;

  constructor() { super('IntroScene'); }

  init(data: IntroData) {
    this.replayMode = !!data?.replay;
    this.finished = false;
  }

  create() {
    // First-run gate: if already seen and not an explicit replay, skip
    // straight to BootScene without playing.
    if (!this.replayMode && hasSeenIntro()) {
      this.scene.start('BootScene');
      return;
    }

    this.sky = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a1a2c,
    );
    // Soft warm overlay for the sunrise gradient — modulated independently of
    // the base sky so we can ramp it up at dawn and back off afterward.
    this.skyOverlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff7a3a, 0,
    );

    // Full-screen input blocker so clicks don't reach underlying scenes
    // when this is launched on top of the AirportScene (replay path).
    this.clickBlocker = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0,
    ).setInteractive();
    this.clickBlocker.on('pointerdown', () => this.skip());

    this.input.keyboard?.on('keydown', () => this.skip());

    this.skipHint = this.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT - 28,
      'click or press any key to skip',
      {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
        color: '#8090a8',
        fontStyle: 'italic',
      },
    ).setOrigin(0.5).setAlpha(0).setDepth(100);
    this.tweens.add({ targets: this.skipHint, alpha: 1, duration: 1500, delay: 800 });

    // Music — title track if it isn't already running. AudioContext won't
    // unlock until the first user gesture, so on a cold first-launch this
    // is silent until the player clicks (or skips). Acceptable trade-off.
    sound.startMusic('title');

    this.runPhase1Dawn();
  }

  // ============================================================
  // Phase 1 (0–3000ms): pre-dawn airport. Stars, terminal, parked Cessna.
  // ============================================================
  private runPhase1Dawn() {
    const groundY = GAME_HEIGHT * 0.78;

    // Stars — sparse white dots in the upper sky, twinkling.
    const stars = this.add.container(0, 0);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * groundY * 0.85;
      const r = Math.random() < 0.85 ? 1 : 1.5;
      const star = this.add.circle(x, y, r, 0xffffff, 0.6 + Math.random() * 0.3);
      stars.add(star);
      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha * 0.3, to: star.alpha },
        duration: 600 + Math.random() * 1200,
        yoyo: true,
        repeat: -1,
      });
    }

    // Distant horizon mountains as a low silhouette band.
    const mountains = this.add.graphics();
    mountains.fillStyle(0x09121f, 1);
    mountains.beginPath();
    mountains.moveTo(0, groundY);
    let mx = 0;
    while (mx < GAME_WIDTH) {
      const peakX = mx + 60 + Math.random() * 80;
      const peakY = groundY - 12 - Math.random() * 28;
      mountains.lineTo(peakX, peakY);
      mx = peakX;
    }
    mountains.lineTo(GAME_WIDTH, groundY);
    mountains.closePath();
    mountains.fillPath();

    // Ground / apron — dark slab under the airport.
    this.add.rectangle(
      GAME_WIDTH / 2, groundY + (GAME_HEIGHT - groundY) / 2,
      GAME_WIDTH, GAME_HEIGHT - groundY, 0x0a1320,
    );

    // Runway with center-line dashes — stretches across the full width below
    // the terminal apron.
    const runwayY = GAME_HEIGHT * 0.86;
    const runway = this.add.graphics();
    runway.fillStyle(0x18253a, 1);
    runway.fillRect(0, runwayY - 8, GAME_WIDTH, 16);
    runway.fillStyle(0x445570, 0.85);
    for (let i = 40; i < GAME_WIDTH; i += 80) {
      runway.fillRect(i, runwayY - 1, 30, 2);
    }
    // Runway edge lights — soft warm dots either side.
    for (let i = 30; i < GAME_WIDTH; i += 60) {
      this.add.circle(i, runwayY - 14, 1.5, 0xffd47a, 0.9);
      this.add.circle(i, runwayY + 14, 1.5, 0xffd47a, 0.9);
    }

    // Terminal on the left — dark rectangle with lit window dots.
    const termW = 280;
    const termH = 90;
    const termX = 30;
    const termY = groundY - termH;
    const terminal = this.add.graphics();
    terminal.fillStyle(0x111e30, 1);
    terminal.fillRect(termX, termY, termW, termH);
    terminal.lineStyle(1, 0x223046, 1);
    terminal.strokeRect(termX, termY, termW, termH);
    // Window grid — 8 cols × 3 rows of tiny lit cells.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        const lit = Math.random() < 0.55;
        const wx = termX + 16 + c * 32;
        const wy = termY + 14 + r * 24;
        this.add.rectangle(wx, wy, 18, 12, lit ? 0xffd47a : 0x1a2840, lit ? 0.9 : 1);
      }
    }

    // Gate apron — 4 gate boxes extending right from the terminal.
    for (let i = 0; i < 4; i++) {
      const gx = termX + termW + 10 + i * 110;
      const gy = groundY - 6;
      this.add.rectangle(gx + 40, gy, 80, 4, 0x223046, 1);
      this.add.text(gx + 40, gy - 14, `G${i + 1}`, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '10px',
        color: COLORS.textDim,
      }).setOrigin(0.5);
    }

    // Parked Cessna at Gate 1, facing right (nose pointing toward the runway
    // sunrise). Honey-gold tail accent — flavor nod to the default airline.
    const planeStartX = termX + termW + 50;
    const planeStartY = groundY - 18;
    const plane = makePlaneIcon(this, planeStartX, planeStartY, 13, 0xffc857, 0, 'turboprop', true);
    plane.setScale(2.0);

    // Phase 2 fires after 2500ms.
    this.time.delayedCall(2500, () => this.runPhase2Takeoff(plane, planeStartX, planeStartY, runwayY));
  }

  // ============================================================
  // Phase 2 (2500–7000ms): sunrise gradient + Cessna taxi/takeoff.
  // ============================================================
  private runPhase2Takeoff(
    plane: Phaser.GameObjects.Graphics,
    startX: number, startY: number, runwayY: number,
  ) {
    // Sky lerp: pre-dawn navy → purple twilight → dawn orange. The base sky
    // shifts; the overlay rect crossfades the warm wash on top to feel like
    // sunlight catching the apron.
    this.lerpRectColor(this.sky, 0x0a1a2c, 0x3a2a4a, 1500);
    this.time.delayedCall(1500, () => {
      this.lerpRectColor(this.sky, 0x3a2a4a, 0xff9a55, 2000);
    });
    this.tweens.add({
      targets: this.skyOverlay,
      fillAlpha: 0.35,
      duration: 3000,
      delay: 800,
    });

    // Rising sun — orange disc climbs from below the horizon on the right.
    const sun = this.add.circle(GAME_WIDTH - 200, GAME_HEIGHT * 0.78 + 60, 60, 0xffd47a, 0);
    this.tweens.add({
      targets: sun,
      y: GAME_HEIGHT * 0.78 - 30,
      fillAlpha: 0.9,
      duration: 3500,
      delay: 500,
      ease: 'Sine.easeOut',
    });
    // Soft sun halo.
    const halo = this.add.circle(GAME_WIDTH - 200, GAME_HEIGHT * 0.78 + 60, 100, 0xff9a55, 0);
    this.tweens.add({
      targets: halo,
      y: GAME_HEIGHT * 0.78 - 30,
      fillAlpha: 0.35,
      duration: 3500,
      delay: 500,
      ease: 'Sine.easeOut',
    });

    // Taxi — slow roll from gate to runway threshold (~1.2s).
    this.tweens.add({
      targets: plane,
      x: startX + 80,
      y: runwayY,
      duration: 1200,
      delay: 600,
      ease: 'Sine.easeIn',
    });

    // Takeoff — accelerate down the runway then climb off-screen.
    this.time.delayedCall(1800, () => {
      sound.play('takeoff');
      // Acceleration roll.
      this.tweens.add({
        targets: plane,
        x: GAME_WIDTH * 0.6,
        duration: 1100,
        ease: 'Quad.easeIn',
      });
      // Lift-off: rotate nose up, climb, shrink as it recedes.
      this.time.delayedCall(1000, () => {
        this.tweens.add({
          targets: plane,
          x: GAME_WIDTH + 120,
          y: GAME_HEIGHT * 0.3,
          rotation: -0.35,
          scaleX: 1.0,
          scaleY: 1.0,
          alpha: 0.85,
          duration: 1600,
          ease: 'Sine.easeOut',
        });
      });
    });

    // Phase 3 fires after the takeoff plays out.
    this.time.delayedCall(4500, () => this.runPhase3Network());
  }

  // ============================================================
  // Phase 3 (7000–12000ms): cross-fade to a stylized world, network of
  // routes spider out from a highlighted hub.
  // ============================================================
  private runPhase3Network() {
    // Cool daylight map background — fade in over the takeoff scene.
    const mapBg = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x4a78a0,
    ).setAlpha(0);
    this.tweens.add({ targets: mapBg, alpha: 1, duration: 800 });
    this.lerpRectColor(this.sky, 0xff9a55, 0x4a78a0, 800);
    this.tweens.add({ targets: this.skyOverlay, fillAlpha: 0, duration: 800 });

    this.worldLayer = this.add.container(0, 0).setAlpha(0);
    this.tweens.add({ targets: this.worldLayer, alpha: 1, duration: 800, delay: 200 });

    // Curved earth horizon — subtle arc across the lower third for context.
    const horizon = this.add.graphics();
    horizon.fillStyle(0x355d80, 1);
    horizon.beginPath();
    horizon.moveTo(0, GAME_HEIGHT * 0.85);
    for (let x = 0; x <= GAME_WIDTH; x += 10) {
      const t = x / GAME_WIDTH;
      const y = GAME_HEIGHT * 0.78 + Math.sin(t * Math.PI) * -40;
      horizon.lineTo(x, y);
    }
    horizon.lineTo(GAME_WIDTH, GAME_HEIGHT);
    horizon.lineTo(0, GAME_HEIGHT);
    horizon.closePath();
    horizon.fillPath();
    this.worldLayer.add(horizon);

    // Stylized continents — abstract blob silhouettes for "this is a world".
    const continents = this.add.graphics();
    continents.fillStyle(0x2a4a68, 0.85);
    this.drawBlob(continents, 240, 360, [70, 40, 90, 50, 60, 35]);   // NA
    this.drawBlob(continents, 600, 340, [60, 30, 80, 40, 50, 30]);   // Europe
    this.drawBlob(continents, 880, 380, [90, 50, 70, 40, 80, 45]);   // Asia
    this.drawBlob(continents, 380, 560, [40, 35, 60, 30, 50, 30]);   // SA
    this.drawBlob(continents, 700, 600, [50, 25, 70, 35, 45, 25]);   // Africa-ish
    this.drawBlob(continents, 1020, 600, [40, 25, 55, 30, 35, 20]);  // Aus
    this.worldLayer.add(continents);

    // City dots — one is the hub (gold), the others are destinations.
    const hub = { x: 200, y: 470, label: 'HOME' };
    const cities = [
      { x: 280, y: 360, label: 'WEST' },   // NA-W
      { x: 460, y: 380, label: 'EAST' },   // NA-E
      { x: 620, y: 350, label: 'EU' },     // Europe
      { x: 880, y: 360, label: 'ASIA' },   // Asia
      { x: 1040, y: 410, label: 'PAC' },   // Pacific
      { x: 400, y: 540, label: 'SOUTH' },  // SA
    ];

    // Hub dot — pulsing gold ring.
    const hubRing = this.add.circle(hub.x, hub.y, 12, 0xffc857, 0);
    this.worldLayer.add(hubRing);
    const hubDot = this.add.circle(hub.x, hub.y, 5, 0xffc857, 1)
      .setStrokeStyle(2, 0xffffff, 0.9);
    this.worldLayer.add(hubDot);
    this.tweens.add({
      targets: hubRing,
      scale: { from: 0.6, to: 2.4 },
      fillAlpha: { from: 0.6, to: 0 },
      duration: 1400,
      repeat: -1,
    });

    // Destination dots — slate-blue.
    for (const c of cities) {
      const dot = this.add.circle(c.x, c.y, 4, 0xb0c8e0, 0.85);
      this.worldLayer.add(dot);
    }

    // Draw routes one at a time. Each route = 1 arc + 1 plane that flies it.
    const routePalette = [0xffc857, 0xff7755, 0x66ddbb, 0x4488ff, 0xa86cc4, 0xff88aa];
    cities.forEach((c, i) => {
      this.time.delayedCall(400 + i * 600, () => {
        this.drawRoute(hub.x, hub.y, c.x, c.y, routePalette[i % routePalette.length]);
      });
    });

    // Phase 4 fires after the last route lands.
    this.time.delayedCall(4500, () => this.runPhase4Title());
  }

  /** Quadratic-bezier route arc drawn progressively, then a tiny plane
   *  silhouette flies the arc once. */
  private drawRoute(x1: number, y1: number, x2: number, y2: number, color: number) {
    const midX = (x1 + x2) / 2;
    const midY = Math.min(y1, y2) - 80 - Math.abs(x2 - x1) * 0.08;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(x1, y1),
      new Phaser.Math.Vector2(midX, midY),
      new Phaser.Math.Vector2(x2, y2),
    );

    const g = this.add.graphics();
    this.worldLayer.add(g);
    const totalPoints = 40;
    const points = curve.getPoints(totalPoints);

    // Progressive draw — tween a counter and re-stroke the partial path.
    const proxy = { t: 0 };
    this.tweens.add({
      targets: proxy,
      t: 1,
      duration: 900,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(2.5, color, 0.9);
        const cutoff = Math.max(1, Math.floor(points.length * proxy.t));
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < cutoff; i++) g.lineTo(points[i].x, points[i].y);
        g.strokePath();
      },
    });

    // Plane traverses the arc after it finishes drawing. Heading is the
    // tangent direction; we sample two close points to derive it.
    this.time.delayedCall(700, () => {
      const planeProxy = { t: 0 };
      // Start the plane invisible at p0; first onUpdate will place it.
      const planeIcon = makePlaneIcon(this, x1, y1, 70, color, 0, 'narrowbody', false);
      planeIcon.setScale(0.9);
      this.worldLayer.add(planeIcon);
      this.tweens.add({
        targets: planeProxy,
        t: 1,
        duration: 1300,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const p = curve.getPoint(planeProxy.t);
          const ahead = curve.getPoint(Math.min(1, planeProxy.t + 0.02));
          planeIcon.setPosition(p.x, p.y);
          planeIcon.setRotation(Math.atan2(ahead.y - p.y, ahead.x - p.x));
        },
        onComplete: () => {
          this.tweens.add({ targets: planeIcon, alpha: 0, duration: 200 });
        },
      });
    });
  }

  // ============================================================
  // Phase 4 (12000–15000ms): title card.
  // ============================================================
  private runPhase4Title() {
    // Fade everything beneath behind a dark veil so the title sits clean.
    const veil = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.bg, 0,
    );
    this.tweens.add({ targets: veil, fillAlpha: 1, duration: 900 });

    this.titleLayer = this.add.container(0, 0).setAlpha(0);

    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, 'HUB & SPOKE', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '72px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5).setScale(0.96);
    this.titleLayer.add(title);

    const tagline = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.52, 'a small airline. a big sky.', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '18px',
      color: COLORS.text,
      fontStyle: 'italic',
    }).setOrigin(0.5).setAlpha(0);
    this.titleLayer.add(tagline);

    const prompt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.68, '[ Click to begin ]', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '14px',
      color: COLORS.textDim,
    }).setOrigin(0.5).setAlpha(0);
    this.titleLayer.add(prompt);

    // Stagger the reveals.
    this.tweens.add({ targets: this.titleLayer, alpha: 1, duration: 600, delay: 400 });
    this.tweens.add({ targets: title, scale: 1.0, duration: 900, delay: 400, ease: 'Back.easeOut' });
    this.tweens.add({ targets: tagline, alpha: 1, duration: 700, delay: 1100 });
    this.tweens.add({
      targets: prompt,
      alpha: { from: 0, to: 1 },
      duration: 600,
      delay: 1700,
      onComplete: () => {
        // Subtle blink on the prompt so the user knows where to look.
        this.tweens.add({
          targets: prompt,
          alpha: { from: 1, to: 0.4 },
          duration: 800,
          yoyo: true,
          repeat: -1,
        });
      },
    });

    // Fade the skip hint out — at this point the prompt itself is the cue.
    this.tweens.add({ targets: this.skipHint, alpha: 0, duration: 400, delay: 1700 });
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** Tween a rectangle's fill color through the RGB space over `durationMs`. */
  private lerpRectColor(rect: Phaser.GameObjects.Rectangle, from: number, to: number, durationMs: number) {
    const colorA = Phaser.Display.Color.IntegerToColor(from);
    const colorB = Phaser.Display.Color.IntegerToColor(to);
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: durationMs,
      onUpdate: tween => {
        const t = tween.getValue() ?? 0;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(colorA, colorB, 100, t);
        rect.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  }

  /** Draw a soft irregular blob centered at (cx, cy) using `radii` as the
   *  per-spoke radius around 6 equally-spaced angles. Used for stylized
   *  continent silhouettes in phase 3. */
  private drawBlob(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radii: number[]) {
    g.beginPath();
    const n = radii.length;
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const angle = (idx / n) * Math.PI * 2;
      const r = radii[idx];
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * 0.6;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
  }

  /** Skip-or-advance handler. First press skips to the title card if we're
   *  mid-cinematic; second press (or any press during the title) exits to
   *  whatever scene was queued. */
  private skip() {
    if (this.finished) return;

    // If we haven't reached the title layer yet, fast-forward to phase 4.
    // Check `titleLayer` existence rather than its alpha so a rapid second
    // click during the title's fade-in doesn't re-enter phase 4.
    if (!this.titleLayer) {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.runPhase4Title();
      return;
    }

    this.finished = true;
    markIntroSeen();

    if (this.replayMode) {
      // Layered on top of an existing scene — just stop ourselves and the
      // underlying scene (Settings → Airport) keeps running.
      this.scene.stop();
      return;
    }
    // First-run path: hand off to the slot picker.
    this.scene.start('BootScene');
  }
}
