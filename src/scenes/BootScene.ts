import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { GameState } from '../state/GameState';
import { registerEconomyHooks } from '../systems/Economy';
import { registerFlightHooks } from '../systems/Flights';
import { registerAIHooks } from '../systems/AI';
import { registerStockHooks } from '../systems/Stocks';
import { registerBankHooks } from '../systems/Bank';
import { registerPersonnelHooks } from '../systems/Personnel';
import { registerEventHooks } from '../systems/Events';
import { registerCargoHooks, refreshOffers } from '../systems/Cargo';
import { registerSabotageHooks } from '../systems/Sabotage';
import { registerLoungeHooks, refreshContacts } from '../systems/Lounge';
import { registerMilestoneHooks } from '../systems/Milestones';
import {
  registerAutoSave, saveNow, listSlots, loadSlot, deleteSlot, setActiveSlot,
  SlotInfo, MAX_SLOTS,
} from '../systems/Save';
import { Button } from '../ui/Button';
import { formatMoney } from '../systems/Clock';
import { Difficulty, DIFFICULTIES } from '../state/Difficulty';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    // Register game-system hooks once. Auto-save is wired after the player
    // chooses a slot.
    registerEconomyHooks();
    registerFlightHooks();
    registerAIHooks();
    registerStockHooks();
    registerBankHooks();
    registerPersonnelHooks();
    registerEventHooks();
    registerCargoHooks();
    registerSabotageHooks();
    registerLoungeHooks();
    registerMilestoneHooks();

    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.add
      .text(GAME_WIDTH / 2, 80, 'HUB & SPOKE', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '48px',
        color: COLORS.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 130, 'an airline tycoon', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '16px',
        color: COLORS.text,
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    this.renderSlots();
  }

  private renderSlots() {
    // Wipe any prior slot UI so re-render is clean.
    if (this.slotLayer) this.slotLayer.destroy(true);
    this.slotLayer = this.add.container(0, 0);

    this.slotLayer.add(this.add.text(GAME_WIDTH / 2, 200, 'Save Slots', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '20px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5));

    const slots = listSlots();
    const startY = 240;
    const rowH = 70;
    const rowW = 700;
    const x = GAME_WIDTH / 2;

    for (const slot of slots) {
      const y = startY + (slot.id - 1) * rowH;
      this.drawSlotRow(slot, x, y, rowW);
    }

    this.slotLayer.add(this.add.text(GAME_WIDTH / 2, startY + MAX_SLOTS * rowH + 12,
      'Auto-saves every game hour and on tab close. Slot 1 carries any pre-existing save.',
      { fontFamily: 'Segoe UI, Tahoma, sans-serif', fontSize: '12px', color: COLORS.textDim }
    ).setOrigin(0.5));
  }

  private slotLayer!: Phaser.GameObjects.Container;

  private drawSlotRow(slot: SlotInfo, cx: number, cy: number, w: number) {
    const h = 60;
    const left = cx - w / 2;

    const bg = this.add.rectangle(cx, cy, w, h, slot.empty ? 0x142036 : 0x1a3450)
      .setStrokeStyle(1, slot.empty ? 0x335577 : 0x88c0e0);
    this.slotLayer.add(bg);

    // Slot id
    this.slotLayer.add(this.add.text(left + 24, cy, `#${slot.id}`, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '20px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    if (slot.empty) {
      this.slotLayer.add(this.add.text(left + 80, cy, '— empty —', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '14px',
        color: COLORS.textDim,
        fontStyle: 'italic',
      }).setOrigin(0, 0.5));

      const newBtn = new Button({
        scene: this,
        x: left + w - 90, y: cy, width: 140, height: 32,
        label: 'New Game',
        onClick: () => this.openDifficultyPicker(slot.id),
      });
      this.slotLayer.add(newBtn);
      return;
    }

    // Filled slot: show airline name + date + cash
    this.slotLayer.add(this.add.text(left + 80, cy - 12, slot.airlineName ?? '', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '15px',
      color: '#e8eef5',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    this.slotLayer.add(this.add.text(left + 80, cy + 10,
      `${slot.date ?? ''}    ${formatMoney(slot.cash ?? 0)}`,
      { fontFamily: 'Segoe UI, Tahoma, sans-serif', fontSize: '12px', color: COLORS.textDim }
    ).setOrigin(0, 0.5));

    const continueBtn = new Button({
      scene: this,
      x: left + w - 220, y: cy, width: 110, height: 30,
      label: 'Continue',
      onClick: () => this.continueSlot(slot.id),
    });
    const overwriteBtn = new Button({
      scene: this,
      x: left + w - 100, y: cy - 16, width: 110, height: 26,
      label: 'New (overwrite)',
      onClick: () => {
        if (confirm(`Overwrite slot #${slot.id} with a new game?`)) this.openDifficultyPicker(slot.id);
      },
    });
    const deleteBtn = new Button({
      scene: this,
      x: left + w - 100, y: cy + 14, width: 110, height: 26,
      label: 'Delete',
      onClick: () => {
        if (confirm(`Delete save in slot #${slot.id}? This cannot be undone.`)) {
          deleteSlot(slot.id);
          this.renderSlots();
        }
      },
    });
    this.slotLayer.add(continueBtn);
    this.slotLayer.add(overwriteBtn);
    this.slotLayer.add(deleteBtn);
  }

  private continueSlot(id: number) {
    if (!loadSlot(id)) {
      // Corrupt slot — fall back to fresh game in same slot.
      GameState.reset();
      setActiveSlot(id);
    }
    this.go();
  }

  private startNewGame(id: number, difficulty: Difficulty) {
    GameState.reset(difficulty);
    setActiveSlot(id);
    this.go();
  }

  /** Modal-ish overlay listing difficulty presets for a new game. */
  private openDifficultyPicker(slotId: number) {
    const overlay = this.add.container(0, 0).setDepth(50);
    overlay.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0).setInteractive());
    overlay.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 720, 460, COLORS.panel)
      .setStrokeStyle(2, COLORS.panelBorder));
    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 200, 'Choose Difficulty', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '22px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5));

    const cardW = 660;
    const cardH = 78;
    const startY = GAME_HEIGHT / 2 - 150;
    const order: Difficulty[] = ['easy', 'normal', 'hard', 'brutal'];
    order.forEach((d, i) => {
      const cy = startY + i * (cardH + 8);
      const cfg = DIFFICULTIES[d];
      const card = this.add.rectangle(GAME_WIDTH / 2, cy, cardW, cardH, 0x1a3450)
        .setStrokeStyle(1, 0x88c0e0);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(0x2a5780));
      card.on('pointerout',  () => card.setFillStyle(0x1a3450));
      card.on('pointerdown', () => {
        overlay.destroy(true);
        this.startNewGame(slotId, d);
      });
      overlay.add(card);

      overlay.add(this.add.text(GAME_WIDTH / 2 - cardW / 2 + 18, cy - 22, cfg.label, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '17px',
        color: COLORS.accentText,
        fontStyle: 'bold',
      }).setOrigin(0, 0));
      overlay.add(this.add.text(GAME_WIDTH / 2 - cardW / 2 + 18, cy - 1, cfg.tagline, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '12px',
        color: COLORS.text,
      }).setOrigin(0, 0));
      const stats = `Start cash ${formatMoney(cfg.startCash)}  ·  Crew ${cfg.startPilots}P/${cfg.startMechanics}M  ·  AI buy ${(cfg.aiBuyChance * 100).toFixed(0)}% / day  ·  Loan APR ×${cfg.loanAprMult.toFixed(1)}  ·  Events ${(cfg.eventChance * 100).toFixed(0)}% / day`;
      overlay.add(this.add.text(GAME_WIDTH / 2 - cardW / 2 + 18, cy + 18, stats, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
        color: COLORS.textDim,
      }).setOrigin(0, 0));
    });

    const cancelBtn = new Button({
      scene: this,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + 200,
      width: 120, height: 32,
      label: 'Cancel',
      onClick: () => overlay.destroy(true),
    });
    overlay.add(cancelBtn);
  }

  private go() {
    refreshOffers();
    refreshContacts();
    registerAutoSave();
    saveNow();
    this.scene.start('AirportScene');
    this.scene.launch('HUDScene');
  }
}
