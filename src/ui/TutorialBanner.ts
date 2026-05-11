import Phaser from 'phaser';
import { GAME_WIDTH, COLORS } from '../config';
import { Button } from './Button';
import { STEPS, dismissTutorial } from '../systems/Tutorial';

/**
 * Slim banner that floats just below the HUD bar with the current
 * tutorial hint. Polled by HUDScene each tick — `currentIndex`
 * advances when the step's `isComplete` returns true. A "Skip" button
 * lets the player dismiss the tutorial outright.
 *
 * Lives in HUDScene so it stays visible on top of both the apron and
 * any open room scene.
 */
export class TutorialBanner {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Rectangle;
  private text!: Phaser.GameObjects.Text;
  private currentIndex = 0;
  private dismissed = false;
  /** Optional callback the host scene fires when the banner has been
   *  fully dismissed (skipped or completed). HUDScene uses it to clear
   *  its `tutorialBanner` field so we don't keep polling a dead one. */
  private onDismiss?: () => void;

  constructor(scene: Phaser.Scene, onDismiss?: () => void) {
    this.scene = scene;
    this.onDismiss = onDismiss;
    this.container = scene.add.container(0, 0).setDepth(100);
    this.build();
    this.renderCurrent();
  }

  private build() {
    const y = 60;
    const w = GAME_WIDTH - 200;
    const x = (GAME_WIDTH - w) / 2;
    this.bg = this.scene.add
      .rectangle(x, y, w, 44, 0x0d2a44, 0.92)
      .setOrigin(0)
      .setStrokeStyle(2, 0xffc857);
    // Accent stripe on the left to match the room-tile look.
    const accent = this.scene.add
      .rectangle(x + 3, y + 4, 4, 36, 0xffc857)
      .setOrigin(0);
    const icon = this.scene.add.text(x + 18, y + 13, '💡', {
      fontFamily: 'Segoe UI Emoji, Segoe UI Symbol, Segoe UI, sans-serif',
      fontSize: '18px',
    });
    this.text = this.scene.add.text(x + 50, y + 14, '', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color: COLORS.accentText,
      wordWrap: { width: w - 200 },
    });
    const skip = new Button({
      scene: this.scene,
      x: x + w - 60,
      y: y + 22,
      width: 90,
      height: 24,
      label: 'Skip',
      bg: 0x402030,
      bgHover: 0x602040,
      textColor: '#f4ecdc',
      onClick: () => this.dismiss(),
    });
    this.container.add([this.bg, accent, icon, this.text, skip]);
  }

  private renderCurrent() {
    const step = STEPS[this.currentIndex];
    if (!step) {
      this.dismiss();
      return;
    }
    this.text.setText(step.text);
  }

  /** Called every tick by HUDScene. Advances the step when the current
   *  one's goal is met. */
  tick() {
    if (this.dismissed) return;
    const step = STEPS[this.currentIndex];
    if (!step) {
      this.dismiss();
      return;
    }
    if (step.isComplete()) {
      this.currentIndex += 1;
      this.renderCurrent();
    }
  }

  dismiss() {
    if (this.dismissed) return;
    this.dismissed = true;
    dismissTutorial();
    this.container.destroy(true);
    this.onDismiss?.();
  }
}
