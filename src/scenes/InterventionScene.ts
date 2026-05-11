import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { GameState } from '../state/GameState';
import { Intervention } from '../systems/Interventions';
import { Button } from '../ui/Button';
import { sound } from '../systems/Sound';

/**
 * Modal popup for a random intervention event. Two big choice buttons,
 * a description, and an optional state-context footer. Pauses HUDScene
 * on open so the game clock waits for the player to decide.
 *
 * Launched from HUDScene when `consumePendingIntervention()` returns a
 * non-null event (same polling pattern as the weekly newspaper).
 */
export class InterventionScene extends Phaser.Scene {
  private intervention!: Intervention;

  constructor() {
    super({ key: 'InterventionScene', active: false });
  }

  init(data: { intervention: Intervention }) {
    this.intervention = data.intervention;
  }

  create() {
    this.scene.pause('HUDScene');
    sound.play('sponsor');

    // Dark backdrop — clicks anywhere on it are absorbed (so the room
    // underneath doesn't react while the modal is up).
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65)
      .setOrigin(0)
      .setInteractive();

    const panelW = 600;
    const panelH = 340;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panelX = cx - panelW / 2;
    const panelY = cy - panelH / 2;

    this.add.rectangle(cx, cy, panelW, panelH, COLORS.panel)
      .setStrokeStyle(2, 0xffc857);
    // Gold accent stripe on the left edge — matches the milestone popup
    // and tutorial banner so "moment of consequence" reads consistently.
    this.add.rectangle(panelX + 4, cy, 4, panelH - 16, 0xffc857)
      .setOrigin(0.5);

    this.add.text(cx, panelY + 30, this.intervention.title, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '22px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, panelY + 90, this.intervention.description, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color: COLORS.text,
      align: 'center',
      wordWrap: { width: panelW - 60 },
    }).setOrigin(0.5, 0);

    // Footer — state context. Shown above the buttons if the intervention
    // wants the player to see e.g. their current cash before deciding.
    if (this.intervention.footer) {
      this.add.text(cx, panelY + panelH - 90, this.intervention.footer(GameState.get()), {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
        align: 'center',
      }).setOrigin(0.5);
    }

    // Two choice buttons at the bottom — each runs its option's apply()
    // and dismisses.
    const [optA, optB] = this.intervention.options;
    const btnY = panelY + panelH - 40;
    const btnW = 240;
    const btnGap = 16;
    const totalW = btnW * 2 + btnGap;

    const buildOption = (opt: typeof optA, x: number, primary: boolean) => {
      const reason = opt.disabledReason ? opt.disabledReason(GameState.get()) : null;
      const disabled = reason !== null;
      const btn = new Button({
        scene: this,
        x, y: btnY, width: btnW, height: 38,
        label: opt.label,
        bg: primary ? 0x2f6042 : 0x14304a,
        bgHover: primary ? 0x3f8055 : 0x2a5780,
        textColor: '#f4ecdc',
        disabled,
        onClick: () => {
          opt.apply(GameState.get());
          this.dismiss();
        },
      });
      if (reason) {
        // Disabled — show the reason underneath in red.
        this.add.text(x, btnY + 24, reason, {
          fontFamily: 'Segoe UI, Tahoma, sans-serif',
          fontSize: '11px',
          color: '#ff7b88',
        }).setOrigin(0.5, 0);
      }
      return btn;
    };

    buildOption(optA, cx - totalW / 2 + btnW / 2, /* primary */ true);
    buildOption(optB, cx + totalW / 2 - btnW / 2, /* primary */ false);

    // Esc dismisses without applying either option — but log it so the
    // player isn't surprised when nothing happens.
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      .on('down', () => {
        GameState.get().pushNews(`Deferred: "${this.intervention.title}".`);
        this.dismiss();
      });
  }

  private dismiss() {
    this.scene.resume('HUDScene');
    this.scene.stop();
  }
}
