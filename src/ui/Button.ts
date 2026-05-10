import Phaser from 'phaser';
import { sound } from '../systems/Sound';

export interface ButtonOpts {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  onClick: () => void;
  bg?: number;
  bgHover?: number;
  textColor?: string;
  disabled?: boolean;
}

export class Button extends Phaser.GameObjects.Container {
  private rect: Phaser.GameObjects.Rectangle;
  private txt: Phaser.GameObjects.Text;
  private bg: number;
  private bgHover: number;
  private opts: ButtonOpts;
  private disabled: boolean;

  constructor(opts: ButtonOpts) {
    super(opts.scene, opts.x, opts.y);
    this.opts = opts;
    this.bg = opts.bg ?? 0x2d4a6a;
    this.bgHover = opts.bgHover ?? 0x3d6a92;
    this.disabled = opts.disabled ?? false;

    this.rect = opts.scene.add
      .rectangle(0, 0, opts.width, opts.height, this.disabled ? 0x223046 : this.bg)
      .setStrokeStyle(1, 0x88c0e0, this.disabled ? 0.4 : 1);
    this.txt = opts.scene.add
      .text(0, 0, opts.label, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '14px',
        color: this.disabled ? '#6a7a8c' : (opts.textColor ?? '#e8eef5'),
      })
      .setOrigin(0.5);

    this.add([this.rect, this.txt]);
    this.setSize(opts.width, opts.height);
    opts.scene.add.existing(this);

    if (!this.disabled) {
      // Make the rectangle the interactive target — its bounds are exact and
      // input events bubble up correctly from container children.
      this.rect.setInteractive({ useHandCursor: true });
      this.rect.on('pointerover', () => this.rect.setFillStyle(this.bgHover));
      this.rect.on('pointerout',  () => this.rect.setFillStyle(this.bg));
      this.rect.on('pointerdown', () => { sound.play('click'); opts.onClick(); });
    }
  }

  setLabel(label: string) {
    this.txt.setText(label);
  }

  setDisabled(d: boolean) {
    if (d === this.disabled) return;
    this.disabled = d;
    if (d) {
      this.rect.setFillStyle(0x223046);
      this.rect.setStrokeStyle(1, 0x88c0e0, 0.4);
      this.txt.setColor('#6a7a8c');
      this.rect.disableInteractive();
    } else {
      this.rect.setFillStyle(this.bg);
      this.rect.setStrokeStyle(1, 0x88c0e0, 1);
      this.txt.setColor(this.opts.textColor ?? '#e8eef5');
      this.rect.setInteractive({ useHandCursor: true });
      this.rect.on('pointerover', () => this.rect.setFillStyle(this.bgHover));
      this.rect.on('pointerout',  () => this.rect.setFillStyle(this.bg));
      this.rect.on('pointerdown', () => { sound.play('click'); this.opts.onClick(); });
    }
  }
}
