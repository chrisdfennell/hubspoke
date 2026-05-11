import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { Button } from '../ui/Button';
import { GameState } from '../state/GameState';
import { deleteSlot, getActiveSlot, clearActiveSlot } from '../systems/Save';
import { sound } from '../systems/Sound';
import { renderStatsBlock } from '../ui/StatsBlock';

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
    // End the loop — title music can resume from BootScene if the player
    // starts a new run.
    sound.stopMusic();

    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8)
      .setOrigin(0)
      .setInteractive();

    const reason: GameOverReason = this.data.get('reason');
    const msg: string = this.data.get('message');

    const titleText = reason === 'victory' ? 'VICTORY' : reason === 'bankruptcy' ? 'BANKRUPTCY' : 'TAKEN OVER';
    const titleColor = reason === 'victory' ? '#7be08a' : '#ff7b88';

    this.add.text(GAME_WIDTH / 2, 100, titleText, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '56px',
      color: titleColor,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 180, msg, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '17px',
      color: COLORS.text,
      align: 'center',
      wordWrap: { width: GAME_WIDTH - 200 },
    }).setOrigin(0.5);

    // Career stats — same layout as the live Stats panel for continuity.
    this.add.text(GAME_WIDTH / 2, 260, 'Career Stats', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '18px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    // Stats block is two columns of ~420px wide; center the cluster.
    const blockX = GAME_WIDTH / 2 - 420;
    renderStatsBlock(this, blockX, 295, GameState.get().stats);

    new Button({
      scene: this,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 80,
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
