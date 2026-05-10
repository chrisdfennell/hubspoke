import Phaser from 'phaser';

/**
 * Floating tooltip — hover-attachable rich-text bubble. One instance per scene.
 * Tooltip lives outside any masked content container so it isn't clipped by
 * the room scroll-area mask.
 */
export class Tooltip {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private textObj: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene) {
    this.bg = scene.add
      .rectangle(0, 0, 200, 40, 0x0b1a2c, 0.95)
      .setStrokeStyle(1, 0x88c0e0)
      .setOrigin(0, 0);
    this.textObj = scene.add
      .text(8, 6, '', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '12px',
        color: '#e8eef5',
        wordWrap: { width: 320 },
      })
      .setOrigin(0, 0);
    this.container = scene.add
      .container(0, 0, [this.bg, this.textObj])
      .setDepth(10_000)
      .setVisible(false);
  }

  show(pointerX: number, pointerY: number, text: string) {
    this.textObj.setText(text);
    const padX = 10, padY = 6;
    const w = Math.ceil(this.textObj.width) + padX * 2;
    const h = Math.ceil(this.textObj.height) + padY * 2;
    this.bg.setSize(w, h);
    this.textObj.setPosition(padX, padY);
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const cx = Math.min(Math.max(pointerX + 14, 4), screenW - w - 4);
    const cy = Math.min(Math.max(pointerY + 14, 4), screenH - h - 4);
    this.container.setPosition(cx, cy);
    this.container.setVisible(true);
  }

  hide() {
    this.container.setVisible(false);
  }

  /** Attach hover-tooltip behavior to an interactive target. */
  attach(target: Phaser.GameObjects.GameObject, getText: () => string) {
    type Interactable = Phaser.GameObjects.GameObject & { input?: unknown };
    if (!(target as Interactable).input) {
      target.setInteractive({ useHandCursor: false });
    }
    target.on('pointerover', (p: Phaser.Input.Pointer) => this.show(p.x, p.y, getText()));
    target.on('pointermove', (p: Phaser.Input.Pointer) => this.show(p.x, p.y, getText()));
    target.on('pointerout',  () => this.hide());
  }
}
