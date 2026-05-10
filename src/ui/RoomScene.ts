import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { GameState } from '../state/GameState';

/**
 * Base for any "room" scene. Provides framed panel, title, Close button, and
 * a vertically scrollable content container. Subclasses fill in `buildRoom`.
 */
export abstract class RoomScene extends Phaser.Scene {
  protected title: string = 'Room';
  protected panel!: Phaser.GameObjects.Rectangle;
  /** Container whose contents scroll within the panel's inner area. */
  protected content!: Phaser.GameObjects.Container;
  /** Tooltip helper — sits above all content, ignored by mask. */
  protected tooltip!: Tooltip;
  /** Vertical scroll position (>= 0). */
  protected scrollY = 0;
  /** The lowest y any addText/addChild has reached — used as scroll extent. */
  private contentBottom = 0;

  protected readonly PANEL_PAD = 60;
  /** Pixels of vertical room above the scroll area used for the title strip. */
  protected readonly HEADER_HEIGHT = 70;
  /** Pixels of vertical padding inside the panel below the scroll area. */
  protected readonly FOOTER_HEIGHT = 16;

  /** True if this scene auto-paused the game on entry — used so closeRoom
   *  only un-pauses what it itself paused. */
  private autoPausedGame = false;
  /** Guard so a double-tap on Close / ESC doesn't queue two fade-out tweens. */
  private closingTransition = false;

  create() {
    // Reset per-visit lifecycle flags. Phaser scenes are persistent instances
    // — start/stop reuses the same object, so any field set during a previous
    // visit's closeRoom() (closingTransition, autoPausedGame) is still set
    // when create() runs again. Without this reset the next Close click
    // silently no-ops because closingTransition guards re-entry.
    this.closingTransition = false;
    this.autoPausedGame = false;

    // Fade in: start invisible, tween camera alpha → 1. Camera-level tween
    // covers everything this scene renders without needing every object in
    // a shared container. AirportScene behind us stays at full opacity.
    this.cameras.main.setAlpha(0);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 180,
      ease: 'Sine.easeOut',
    });

    // Honor the pauseOnRoomEntry setting: if the world is currently running,
    // pause it for the duration of this room visit and remember to resume.
    const state = GameState.get();
    if (state.settings.pauseOnRoomEntry && !state.paused) {
      state.paused = true;
      this.autoPausedGame = true;
    }

    // Dim overlay so AirportScene shows behind. Interactive to swallow clicks.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();

    const w = GAME_WIDTH - this.PANEL_PAD * 2;
    const h = GAME_HEIGHT - this.PANEL_PAD * 2;
    this.panel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, w, h, COLORS.panel)
      .setStrokeStyle(2, COLORS.panelBorder);

    this.add
      .text(GAME_WIDTH / 2, this.PANEL_PAD + 30, this.title, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '24px',
        color: COLORS.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    new Button({
      scene: this,
      x: GAME_WIDTH - this.PANEL_PAD - 60,
      y: this.PANEL_PAD + 30,
      width: 100,
      height: 32,
      label: 'Close',
      onClick: () => this.closeRoom(),
    });

    // Scrollable content container.
    this.content = this.add.container(0, 0);

    // Mask: a hidden Graphics drawn on the display list (more reliable
    // across Phaser builds than `make.graphics` for geometry masks).
    const sa = this.scrollArea;
    const maskShape = this.add.graphics().setVisible(false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(sa.x, sa.y, sa.w, sa.h);
    const mask = maskShape.createGeometryMask();
    this.content.setMask(mask);
    this.maskShape = maskShape;

    // Scroll bar (visual only — drawn after content build sets contentBottom).
    this.scrollbar = this.add.rectangle(
      sa.x + sa.w + 6, sa.y, 6, 0, 0x88c0e0, 0.6
    ).setOrigin(0, 0).setVisible(false);

    // Tooltip lives outside `content` so it isn't masked.
    this.tooltip = new Tooltip(this);

    this.buildRoom();
    this.applyMaskRecursively();
    this.updateScrollMetrics();

    this.input.keyboard?.on('keydown-ESC', () => this.closeRoom());

    // Wheel scrolling.
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _o: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
        this.scrollBy(dy);
      }
    );

    // Page Up / Page Down keys for keyboard accessibility.
    this.input.keyboard?.on('keydown-PAGE_UP',   () => this.scrollBy(-this.scrollArea.h * 0.9));
    this.input.keyboard?.on('keydown-PAGE_DOWN', () => this.scrollBy( this.scrollArea.h * 0.9));
    this.input.keyboard?.on('keydown-HOME',      () => this.scrollTo(0));
    this.input.keyboard?.on('keydown-END',       () => this.scrollTo(this.maxScroll));
  }

  private scrollbar!: Phaser.GameObjects.Rectangle;
  private maskShape!: Phaser.GameObjects.Graphics;

  protected closeRoom() {
    if (this.closingTransition) return;
    this.closingTransition = true;
    if (this.autoPausedGame) {
      GameState.get().paused = false;
      this.autoPausedGame = false;
    }
    // Fade out, then stop the scene + resume Airport. Quicker than fade-in
    // so the player isn't waiting after they've decided to leave.
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 0,
      duration: 140,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.scene.stop();
        this.scene.resume('AirportScene');
      },
    });
  }

  protected rebuild() {
    // Defer to the next tick. Many callers (route-open buttons, +/− ticket
    // adjusters, plane assignment buttons) invoke rebuild from inside their
    // own pointerdown handler. If we run the destroy + re-create synchronously
    // here, Phaser is still mid-input-event for the button being destroyed,
    // and its input plugin gets wedged — the next click on any other button
    // (notably the Close button) silently does nothing.
    this.time.delayedCall(0, () => {
      if (!this.scene.isActive(this.scene.key)) return;
      this.content.removeAll(true);
      this.contentBottom = 0;
      this.buildRoom();
      this.applyMaskRecursively();
      // Clamp scroll if content shrank.
      this.scrollTo(Math.min(this.scrollY, this.maxScroll));
      this.updateScrollMetrics();
    });
  }

  /**
   * Phaser 3 propagates `setMask` to direct container children, but masks on
   * nested Containers (like our Buttons inside `content`) do not always
   * cascade to the Button's own children. Walk the tree and re-apply.
   */
  private applyMaskRecursively() {
    const apply = (obj: Phaser.GameObjects.GameObject) => {
      const masked = obj as Phaser.GameObjects.GameObject & {
        setMask?: (m: Phaser.Display.Masks.GeometryMask) => unknown;
      };
      if (masked.setMask) masked.setMask(this.maskShape.createGeometryMask());
      const container = obj as Phaser.GameObjects.Container;
      if (Array.isArray(container.list)) {
        for (const child of container.list) apply(child);
      }
    };
    for (const child of this.content.list) apply(child);
  }

  protected abstract buildRoom(): void;

  /** The rectangle that masks scrollable content. */
  protected get scrollArea() {
    const b = this.panelBounds;
    return {
      x: b.x,
      y: b.y + this.HEADER_HEIGHT,
      w: b.w,
      h: b.h - this.HEADER_HEIGHT - this.FOOTER_HEIGHT,
    };
  }

  protected get panelBounds() {
    return {
      x: this.PANEL_PAD,
      y: this.PANEL_PAD,
      w: GAME_WIDTH - this.PANEL_PAD * 2,
      h: GAME_HEIGHT - this.PANEL_PAD * 2,
    };
  }

  /** Add a text into the scrollable content. Tracks max y for scroll extent. */
  protected addText(x: number, y: number, text: string, size = 14, color = COLORS.text) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: `${size}px`,
      color,
    });
    this.content.add(t);
    if (y + size + 4 > this.contentBottom) this.contentBottom = y + size + 4;
    return t;
  }

  /** Subclasses can call this when adding any object whose bottom edge defines content extent. */
  protected reportContentBottom(y: number) {
    if (y > this.contentBottom) this.contentBottom = y;
  }

  protected get maxScroll(): number {
    const sa = this.scrollArea;
    return Math.max(0, this.contentBottom - (sa.y + sa.h));
  }

  protected scrollBy(dy: number) {
    this.scrollTo(this.scrollY + dy);
  }

  protected scrollTo(y: number) {
    const clamped = Math.max(0, Math.min(this.maxScroll, y));
    this.scrollY = clamped;
    this.content.y = -clamped;
    this.updateScrollMetrics();
  }

  private updateScrollMetrics() {
    const sa = this.scrollArea;
    const max = this.maxScroll;
    if (max <= 0) {
      this.scrollbar.setVisible(false);
      return;
    }
    const visibleRatio = sa.h / (sa.h + max);
    const barH = Math.max(20, sa.h * visibleRatio);
    const barY = sa.y + (sa.h - barH) * (this.scrollY / max);
    this.scrollbar.setSize(6, barH);
    this.scrollbar.setPosition(sa.x + sa.w + 6, barY);
    this.scrollbar.setVisible(true);
  }
}
