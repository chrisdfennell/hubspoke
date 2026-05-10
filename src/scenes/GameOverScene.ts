import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { Button } from '../ui/Button';
import { GameState } from '../state/GameState';
import { deleteSlot, getActiveSlot, clearActiveSlot } from '../systems/Save';

export type GameOverReason = 'victory' | 'defeat' | 'bankruptcy';

interface GameOverData {
  reason: GameOverReason;
  message: string;
}

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  init(data: GameOverData) {
    this.data.set('reason', data.reason);
    this.data.set('message', data.message);
  }

  create() {
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8)
      .setOrigin(0)
      .setInteractive();

    const reason: GameOverReason = this.data.get('reason');
    const msg: string = this.data.get('message');

    const titleText = reason === 'victory' ? 'VICTORY' : reason === 'bankruptcy' ? 'BANKRUPTCY' : 'TAKEN OVER';
    const titleColor = reason === 'victory' ? '#7be08a' : '#ff7b88';

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, titleText, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '64px',
      color: titleColor,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, msg, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '18px',
      color: COLORS.text,
      align: 'center',
      wordWrap: { width: GAME_WIDTH - 200 },
    }).setOrigin(0.5);

    new Button({
      scene: this,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + 80,
      width: 220,
      height: 40,
      label: 'Back to Title',
      onClick: () => {
        // Wipe the lost save from its slot, then reset to title.
        const active = getActiveSlot();
        if (active !== null) deleteSlot(active);
        clearActiveSlot();
        GameState.reset();
        this.scene.stop('AirportScene');
        this.scene.stop('HUDScene');
        this.scene.stop('GameOverScene');
        this.scene.start('BootScene');
      },
    });
  }
}
