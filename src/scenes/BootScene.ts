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
import { registerStatsHooks } from '../systems/Stats';
import { registerNewspaperHooks, resetNewspaper } from '../systems/Newspaper';
import { registerSponsorHooks } from '../systems/Sponsors';
import { registerInterventionHooks, resetInterventions } from '../systems/Interventions';
import { maybeAutoDismissForLoadedSave } from '../systems/Tutorial';
import {
  registerAutoSave, saveNow, listSlots, loadSlot, deleteSlot, setActiveSlot,
  SlotInfo, MAX_SLOTS,
} from '../systems/Save';
import { Button } from '../ui/Button';
import { formatMoney } from '../systems/Clock';
import { Difficulty, DIFFICULTIES } from '../state/Difficulty';
import { CEOS } from '../state/ceos';
import { sound } from '../systems/Sound';
import { Modal } from '../ui/Modal';
import { makePlaneIcon } from '../ui/PlaneIcon';

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
    registerStatsHooks();
    registerNewspaperHooks();
    registerSponsorHooks();
    registerInterventionHooks();

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
        Modal.confirm(this, {
          title: 'Overwrite save?',
          message: `Slot #${slot.id} currently holds "${slot.airlineName ?? 'an existing save'}". Starting a new game here will overwrite it.`,
          confirmLabel: 'Overwrite',
          cancelLabel: 'Cancel',
          destructive: true,
          onConfirm: () => this.openDifficultyPicker(slot.id),
        });
      },
    });
    const deleteBtn = new Button({
      scene: this,
      x: left + w - 100, y: cy + 14, width: 110, height: 26,
      label: 'Delete',
      onClick: () => {
        Modal.confirm(this, {
          title: 'Delete save?',
          message: `Permanently delete slot #${slot.id} ("${slot.airlineName ?? 'this save'}")? This cannot be undone.`,
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
          destructive: true,
          onConfirm: () => {
            deleteSlot(slot.id);
            this.renderSlots();
          },
        });
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

  private startNewGame(
    id: number,
    difficulty: Difficulty,
    ceoId: string,
    customAirline: { name: string; color: number },
  ) {
    GameState.reset(difficulty, ceoId, customAirline);
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
        this.openCEOPicker(slotId, d);
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
      const loanReq = cfg.requiredPrincipalPct > 0
        ? `Loan: ${(cfg.requiredPrincipalPct * 100).toFixed(0)}% principal / month`
        : 'Loan: interest only';
      const stats = `Start cash ${formatMoney(cfg.startCash)}  ·  Crew ${cfg.startPilots}P/${cfg.startMechanics}M  ·  AI buy ${(cfg.aiBuyChance * 100).toFixed(0)}% / day  ·  ${loanReq}  ·  Events ${(cfg.eventChance * 100).toFixed(0)}% / day`;
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

  /** Modal-ish overlay listing CEOs. Shown right after the difficulty pick,
   *  before the new game actually starts. Each card is one CEO with their
   *  perk blurb; clicking commits the run. */
  private openCEOPicker(slotId: number, difficulty: Difficulty) {
    const overlay = this.add.container(0, 0).setDepth(50);
    overlay.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0).setInteractive());
    overlay.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 760, 540, COLORS.panel)
      .setStrokeStyle(2, COLORS.panelBorder));
    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 235, 'Choose Your CEO', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '22px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5));
    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 205,
      `Difficulty: ${DIFFICULTIES[difficulty].label} — pick the person running the airline.`,
      {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
      }).setOrigin(0.5));

    const cardW = 700;
    const cardH = 92;
    const startY = GAME_HEIGHT / 2 - 160;
    CEOS.forEach((ceo, i) => {
      const cy = startY + i * (cardH + 8);
      const card = this.add.rectangle(GAME_WIDTH / 2, cy, cardW, cardH, 0x1a3450)
        .setStrokeStyle(2, ceo.color);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(0x2a5780));
      card.on('pointerout',  () => card.setFillStyle(0x1a3450));
      card.on('pointerdown', () => {
        overlay.destroy(true);
        this.openAirlinePicker(slotId, difficulty, ceo.id);
      });
      overlay.add(card);

      // Glyph "portrait" on the left of the card.
      overlay.add(this.add.text(
        GAME_WIDTH / 2 - cardW / 2 + 36, cy, ceo.glyph,
        {
          fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI Symbol, Segoe UI, sans-serif',
          fontSize: '40px',
        },
      ).setOrigin(0.5));

      // Name + epithet line.
      overlay.add(this.add.text(
        GAME_WIDTH / 2 - cardW / 2 + 80, cy - 28, `${ceo.name}  —  ${ceo.epithet}`,
        {
          fontFamily: 'Segoe UI, Tahoma, sans-serif',
          fontSize: '17px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        },
      ).setOrigin(0, 0));
      // Tagline.
      overlay.add(this.add.text(
        GAME_WIDTH / 2 - cardW / 2 + 80, cy - 6, ceo.tagline,
        {
          fontFamily: 'Segoe UI, Tahoma, sans-serif',
          fontSize: '12px',
          color: COLORS.text,
          fontStyle: 'italic',
        },
      ).setOrigin(0, 0));
      // Perk blurb.
      overlay.add(this.add.text(
        GAME_WIDTH / 2 - cardW / 2 + 80, cy + 18, ceo.perkBlurb,
        {
          fontFamily: 'Segoe UI, Tahoma, sans-serif',
          fontSize: '12px',
          color: COLORS.textDim,
        },
      ).setOrigin(0, 0));
    });

    const cancelBtn = new Button({
      scene: this,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + 235,
      width: 120, height: 32,
      label: 'Back',
      onClick: () => {
        overlay.destroy(true);
        this.openDifficultyPicker(slotId);
      },
    });
    overlay.add(cancelBtn);
  }

  /** Last step of new-game flow — pick airline name + tail color. The
   *  human's airline name + color drive every silhouette, news headline,
   *  and passenger letter, so giving the player a choice here is a big
   *  identity boost over the locked-in "Honey Air" gold default. */
  private openAirlinePicker(slotId: number, difficulty: Difficulty, ceoId: string) {
    let chosenName = 'Honey Air';
    let chosenColor = 0xffc857;
    const palette = [
      0xffc857, // gold — Honey Air classic
      0xff7755, // coral
      0xff88aa, // pink
      0xa86cc4, // purple
      0x4488ff, // sky blue
      0x66ddbb, // mint
      0x55cc77, // green
      0xff9933, // orange
      0xeeeeee, // white
      0x88aabb, // slate blue
    ];

    const overlay = this.add.container(0, 0).setDepth(50);
    overlay.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0).setInteractive());

    overlay.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 640, 520, COLORS.panel)
      .setStrokeStyle(2, COLORS.panelBorder));

    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 230, 'Name Your Airline', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '22px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5));
    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 200,
      `Difficulty: ${DIFFICULTIES[difficulty].label} — final setup before takeoff.`,
      {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
      }).setOrigin(0.5));

    // Live preview — silhouette + airline name. Rebuilt each time either
    // changes so the player sees their choice immediately.
    let silhouette: Phaser.GameObjects.Graphics | null = null;
    const nameText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 75, chosenName, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '24px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    overlay.add(nameText);

    const updatePreview = () => {
      if (silhouette) silhouette.destroy();
      silhouette = makePlaneIcon(
        this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140,
        150, chosenColor, 0, 'narrowbody', false,
      );
      silhouette.setScale(2.5);
      overlay.add(silhouette);
      nameText.setText(chosenName);
    };

    const renameBtn = new Button({
      scene: this,
      x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 - 38,
      width: 140, height: 28,
      label: 'Rename airline',
      onClick: () => {
        Modal.prompt(this, {
          title: 'Name Your Airline',
          message: 'Enter the name your airline will fly under:',
          default: chosenName,
          minLen: 1,
          maxLen: 32,
          onSubmit: (name) => {
            chosenName = name.trim() || chosenName;
            updatePreview();
          },
        });
      },
    });
    overlay.add(renameBtn);

    overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 5, 'Choose a tail color', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color: COLORS.textDim,
    }).setOrigin(0.5));

    // Color grid — 2 rows of 5.
    const cols = 5;
    const cellW = 64;
    const cellH = 52;
    const gridLeft = GAME_WIDTH / 2 - (cols * cellW) / 2;
    const gridTop = GAME_HEIGHT / 2 + 30;
    const rings: Phaser.GameObjects.Arc[] = [];
    palette.forEach((color, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridLeft + col * cellW + cellW / 2;
      const cy = gridTop + row * cellH;
      const ring = this.add.circle(cx, cy, 20, color, 1)
        .setStrokeStyle(3, color === chosenColor ? 0xffffff : 0x223046);
      ring.setInteractive({ useHandCursor: true });
      ring.on('pointerdown', () => {
        chosenColor = color;
        rings.forEach((r, idx) => {
          r.setStrokeStyle(3, palette[idx] === chosenColor ? 0xffffff : 0x223046);
        });
        updatePreview();
      });
      overlay.add(ring);
      rings.push(ring);
    });

    const backBtn = new Button({
      scene: this,
      x: GAME_WIDTH / 2 - 120, y: GAME_HEIGHT / 2 + 215,
      width: 120, height: 32,
      label: 'Back',
      onClick: () => {
        overlay.destroy(true);
        this.openCEOPicker(slotId, difficulty);
      },
    });
    const startBtn = new Button({
      scene: this,
      x: GAME_WIDTH / 2 + 120, y: GAME_HEIGHT / 2 + 215,
      width: 160, height: 36,
      label: 'Start Game',
      bg: 0x2f6042,
      bgHover: 0x3f8055,
      textColor: '#f4ecdc',
      onClick: () => {
        overlay.destroy(true);
        this.startNewGame(slotId, difficulty, ceoId, { name: chosenName, color: chosenColor });
      },
    });
    overlay.add(backBtn);
    overlay.add(startBtn);

    updatePreview();
  }

  private go() {
    // Fresh baseline for the weekly paper — module state survives the page
    // load, so clear it whenever a game starts to avoid stale snaps from a
    // prior run on the same tab.
    resetNewspaper();
    resetInterventions();
    // Skip the onboarding banner when continuing a save that's already
    // past the tutorial goalposts (flights flown). Fresh saves still see it.
    maybeAutoDismissForLoadedSave();
    refreshOffers();
    refreshContacts();
    registerAutoSave();
    saveNow();
    // Kick the airport music here (we're in a user-gesture click handler,
    // so the AudioContext can be created/resumed). AirportScene.create()
    // would also work but a few milliseconds later — starting here is
    // tighter to the user's click.
    sound.startMusic('airport-lobby');
    this.scene.start('AirportScene');
    this.scene.launch('HUDScene');
  }
}
