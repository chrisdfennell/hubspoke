import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import {
  saveNow, exportAllSlotsJson, suggestBackupFilename, downloadJson,
  pickJsonFile, summarizeBackup, importAllSlotsJson,
} from '../../systems/Save';
import { sound } from '../../systems/Sound';
import { Modal } from '../../ui/Modal';

/**
 * In-game settings panel. Toggles persist with the save (GameSnapshot.settings).
 *
 * Gameplay settings live here rather than in the runtime sound/UI layer because
 * they directly alter dispatch behavior (skipping flights, holding for load
 * factor) and need to round-trip through saves.
 */
export class SettingsScene extends RoomScene {
  constructor() { super('SettingsScene'); this.title = 'Settings'; }

  buildRoom() {
    const settings = GameState.get().settings;
    const b = this.panelBounds;
    const left = b.x + 40;
    // All interactive controls right-align to this x — keeps labels free to grow.
    const rightEdge = b.x + b.w - 40;
    let y = b.y + 90;

    this.addText(left, y, 'Dispatch', 16, COLORS.accentText);
    y += 30;

    // -- Skip unprofitable flights --
    this.addText(left, y, 'Skip flights that would lose money', 14);
    this.addText(left + 8, y + 22,
      'When on, your planes stay parked instead of dispatching a flight whose estimated profit is negative.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.skipUnprofitable, (next) => {
      settings.skipUnprofitable = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- Min load factor for takeoff --
    const lfPct = Math.round(settings.minLoadFactorForTakeoff * 100);
    this.addText(left, y, `Wait for plane to fill: ${lfPct}% load factor minimum`, 14);
    this.addText(left + 8, y + 22,
      'Hold takeoffs until the route\'s expected load factor reaches this fraction. 0% disables the gate.',
      11, COLORS.textDim);
    const presets: Array<{ label: string; value: number }> = [
      { label: 'Off',  value: 0    },
      { label: '30%',  value: 0.30 },
      { label: '50%',  value: 0.50 },
      { label: '70%',  value: 0.70 },
    ];
    const btnW = 56;
    const gap = 6;
    // Right-align the preset cluster: rightmost button's right edge sits at
    // rightEdge, others march leftward.
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      const indexFromRight = presets.length - 1 - i;
      const cx = rightEdge - btnW / 2 - indexFromRight * (btnW + gap);
      const isActive = Math.abs(settings.minLoadFactorForTakeoff - p.value) < 0.001;
      const btn = new Button({
        scene: this,
        x: cx,
        y: y + 14,
        width: btnW,
        height: 26,
        label: p.label,
        bg: isActive ? 0x3d6a92 : 0x2d4a6a,
        onClick: () => {
          settings.minLoadFactorForTakeoff = p.value;
          saveNow();
          this.rebuild();
        },
      });
      this.content.add(btn);
    }
    y += 56;

    this.addText(left, y, 'Interface', 16, COLORS.accentText);
    y += 30;

    // -- Music volume --
    const musicVol = sound.getMusicVolume();
    const musicLabel =
      musicVol === 0 ? 'Off'
      : musicVol < 0.25 ? 'Low'
      : musicVol < 0.5  ? 'Medium'
      : 'High';
    this.addText(left, y, `Background music: ${musicLabel}`, 14);
    this.addText(left + 8, y + 22,
      'Procedural ambient loop. Mute (top-right speaker) silences everything; this knob trims just the music.',
      11, COLORS.textDim);
    const musicPresets: Array<{ label: string; value: number }> = [
      { label: 'Off',    value: 0    },
      { label: 'Low',    value: 0.15 },
      { label: 'Medium', value: 0.35 },
      { label: 'High',   value: 0.60 },
    ];
    this.addPresetRow(rightEdge, y + 14, musicPresets.length, (i) => {
      const p = musicPresets[i];
      const isActive = Math.abs(musicVol - p.value) < 0.01;
      return {
        label: p.label,
        active: isActive,
        onClick: () => {
          sound.setMusicVolume(p.value);
          this.rebuild();
        },
      };
    });
    y += 56;

    // -- Replay intro cinematic --
    this.addText(left, y, 'Cinematic intro', 14);
    this.addText(left + 8, y + 22,
      'Replay the Dawn Takeoff opening sequence. Shows once on first launch; this lets you watch it again.',
      11, COLORS.textDim);
    const replayBtn = new Button({
      scene: this,
      x: rightEdge - 70,
      y: y + 14,
      width: 140,
      height: 28,
      label: 'Replay intro',
      onClick: () => {
        this.scene.launch('IntroScene', { replay: true });
      },
    });
    this.content.add(replayBtn);
    y += 56;

    // -- Pause on room entry --
    this.addText(left, y, 'Auto-pause when entering a room', 14);
    this.addText(left + 8, y + 22,
      'Pause the world clock whenever you click into a room scene. Speed resumes when you leave.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.pauseOnRoomEntry, (next) => {
      settings.pauseOnRoomEntry = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- Run in background --
    this.addText(left, y, 'Run while tab is hidden', 14);
    this.addText(left + 8, y + 22,
      'Keep the world clock + music running when this tab loses focus. Off: tab away and everything pauses (browser default).',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.runInBackground, (next) => {
      settings.runInBackground = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- Show competitor prices in route tooltip --
    this.addText(left, y, 'Show competitor prices in route tooltip', 14);
    this.addText(left + 8, y + 22,
      'When off, rival route prices on the same city pair are hidden — you fly blind against the competition.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.showCompetitorPrices, (next) => {
      settings.showCompetitorPrices = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- Weekly newspaper modal --
    this.addText(left, y, 'Weekly newspaper', 14);
    this.addText(left + 8, y + 22,
      'Every 7 in-game days, pop a paper-styled summary of the week — headlines, your numbers, passenger letters.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.showWeeklyPaper, (next) => {
      settings.showWeeklyPaper = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- Intervention events --
    this.addText(left, y, 'Random intervention events', 14);
    this.addText(left + 8, y + 22,
      'Roughly weekly: pop a modal with a decision (engine flag, pilots\' raise, charter offer, etc.). Off = quieter run, no decision prompts.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.showInterventions, (next) => {
      settings.showInterventions = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- News ticker filter --
    this.addText(left, y, 'News ticker categories', 14);
    this.addText(left + 8, y + 22,
      'Each toggle hides one category of news from the bottom marquee. Milestones (★) always show.',
      11, COLORS.textDim);
    y += 44;
    const tickerToggles: Array<{ label: string; key: 'showMineNews' | 'showRivalNews' | 'showEventNews' }> = [
      { label: 'Your airline',   key: 'showMineNews'  },
      { label: 'Rivals',         key: 'showRivalNews' },
      { label: 'World events',   key: 'showEventNews' },
    ];
    for (const t of tickerToggles) {
      this.addText(left + 8, y + 6, t.label, 13, COLORS.text);
      this.addToggle(rightEdge, y + 8, settings[t.key], (next) => {
        settings[t.key] = next;
        saveNow();
        this.rebuild();
      });
      y += 30;
    }
    y += 16;

    // -- Section: Persistence --
    this.addText(left, y, 'Save', 16, COLORS.accentText);
    y += 30;

    // -- Autosave cadence --
    this.addText(left, y, `Autosave cadence`, 14);
    this.addText(left + 8, y + 22,
      'How often the game writes to your active save slot. The in-app Save button still works at any time.',
      11, COLORS.textDim);
    const cadencePresets: Array<{ label: string; value: 'hour' | 'day' | 'manual' }> = [
      { label: 'Hourly', value: 'hour'   },
      { label: 'Daily',  value: 'day'    },
      { label: 'Manual', value: 'manual' },
    ];
    this.addPresetRow(rightEdge, y + 14, cadencePresets.length, (i) => {
      const p = cadencePresets[i];
      const isActive = settings.autosaveCadence === p.value;
      return {
        label: p.label,
        active: isActive,
        onClick: () => {
          settings.autosaveCadence = p.value;
          saveNow();
          this.rebuild();
        },
      };
    });
    y += 56;

    // -- Save on close --
    this.addText(left, y, 'Save on browser close', 14);
    this.addText(left + 8, y + 22,
      'Write to the active slot when the tab closes or reloads. Off = your last cadence-driven save is the latest.',
      11, COLORS.textDim);
    this.addToggle(rightEdge, y + 8, settings.saveOnClose, (next) => {
      settings.saveOnClose = next;
      saveNow();
      this.rebuild();
    });
    y += 56;

    // -- Backup all slots --
    this.addText(left, y, 'Backup all slots to file', 14);
    this.addText(left + 8, y + 22,
      'Download every filled slot as a single JSON file. Keep it safe — survives a browser cache wipe or device swap.',
      11, COLORS.textDim);
    const backupBtn = new Button({
      scene: this,
      x: rightEdge - 70,
      y: y + 14,
      width: 140,
      height: 28,
      label: 'Download backup',
      onClick: () => this.handleBackupAll(),
    });
    this.content.add(backupBtn);
    y += 56;

    // -- Restore from backup --
    this.addText(left, y, 'Restore from backup file', 14);
    this.addText(left + 8, y + 22,
      'Read a backup JSON and overwrite the slots it contains. You\'ll be asked to confirm before anything is written.',
      11, COLORS.textDim);
    const restoreBtn = new Button({
      scene: this,
      x: rightEdge - 70,
      y: y + 14,
      width: 140,
      height: 28,
      label: 'Restore backup',
      bg: 0x223046,
      bgHover: 0x2d4a6a,
      onClick: () => this.handleRestoreBackup(),
    });
    this.content.add(restoreBtn);
    y += 56;

    // -- Section: World --
    this.addText(left, y, 'World', 16, COLORS.accentText);
    y += 30;

    // -- Event severity --
    this.addText(left, y, `World event severity`, 14);
    this.addText(left + 8, y + 22,
      'Scales the magnitude of hurricanes, booms, scandals, and the rest. \'Off\' suppresses event rolls entirely.',
      11, COLORS.textDim);
    const severityPresets: Array<{ label: string; value: 'off' | 'mild' | 'normal' | 'harsh' }> = [
      { label: 'Off',    value: 'off'    },
      { label: 'Mild',   value: 'mild'   },
      { label: 'Normal', value: 'normal' },
      { label: 'Harsh',  value: 'harsh'  },
    ];
    this.addPresetRow(rightEdge, y + 14, severityPresets.length, (i) => {
      const p = severityPresets[i];
      const isActive = settings.eventSeverity === p.value;
      return {
        label: p.label,
        active: isActive,
        onClick: () => {
          settings.eventSeverity = p.value;
          saveNow();
          this.rebuild();
        },
      };
    });
    y += 56;

    // -- Auto-repair threshold --
    const repairPctLabel = settings.autoRepairThreshold > 0
      ? `${Math.round(settings.autoRepairThreshold * 100)}%`
      : 'Off';
    this.addText(left, y, `Auto-repair planes below: ${repairPctLabel}`, 14);
    this.addText(left + 8, y + 22,
      'Once a day, idle planes whose condition has dropped below the threshold are fully restored — workshop cost is auto-deducted.',
      11, COLORS.textDim);
    const repairPresets: Array<{ label: string; value: number }> = [
      { label: 'Off', value: 0    },
      { label: '15%', value: 0.15 },
      { label: '30%', value: 0.30 },
      { label: '50%', value: 0.50 },
    ];
    this.addPresetRow(rightEdge, y + 14, repairPresets.length, (i) => {
      const p = repairPresets[i];
      const isActive = Math.abs(settings.autoRepairThreshold - p.value) < 0.001;
      return {
        label: p.label,
        active: isActive,
        onClick: () => {
          settings.autoRepairThreshold = p.value;
          saveNow();
          this.rebuild();
        },
      };
    });
    y += 56;

    this.reportContentBottom(y);
  }

  /** Right-align a row of N preset buttons against `rightX`. Each button is
   *  built from the spec returned by the supplier. Used by the cadence,
   *  severity, repair-threshold pickers. */
  private addPresetRow(
    rightX: number,
    centerY: number,
    count: number,
    supplier: (i: number) => { label: string; active: boolean; onClick: () => void },
  ) {
    const btnW = 56;
    const gap = 6;
    for (let i = 0; i < count; i++) {
      const spec = supplier(i);
      const indexFromRight = count - 1 - i;
      const cx = rightX - btnW / 2 - indexFromRight * (btnW + gap);
      const btn = new Button({
        scene: this,
        x: cx,
        y: centerY,
        width: btnW,
        height: 26,
        label: spec.label,
        bg: spec.active ? 0x3d6a92 : 0x2d4a6a,
        onClick: spec.onClick,
      });
      this.content.add(btn);
    }
  }

  private handleBackupAll() {
    const json = exportAllSlotsJson();
    // Quick sanity check — does the backup actually contain any slots?
    const slotsMatch = json.match(/"slots":\s*\{([^}]*)\}/);
    const isEmpty = !slotsMatch || slotsMatch[1].trim() === '';
    if (isEmpty) {
      Modal.alert(this, {
        title: 'No saves to back up',
        message: 'All save slots are empty.',
      });
      return;
    }
    downloadJson(suggestBackupFilename(), json);
    Modal.alert(this, {
      title: 'Backup downloaded',
      message: 'All filled slots have been bundled into a single JSON file. Keep it somewhere safe — you can use Restore backup to bring everything back.',
    });
  }

  private handleRestoreBackup() {
    pickJsonFile().then(raw => {
      const summary = summarizeBackup(raw);
      if ('error' in summary) {
        Modal.alert(this, {
          title: 'Restore failed',
          message: summary.error,
        });
        return;
      }
      Modal.confirm(this, {
        title: 'Restore backup?',
        message: `This will overwrite slot${summary.count === 1 ? '' : 's'} ${summary.slotIds.map(n => `#${n}`).join(', ')} with the contents of the backup. Any existing saves in those slots will be lost. Continue?`,
        confirmLabel: 'Overwrite',
        destructive: true,
        onConfirm: () => {
          const result = importAllSlotsJson(raw);
          if (!result.ok) {
            Modal.alert(this, {
              title: 'Restore failed',
              message: result.error ?? 'Unknown error.',
            });
            return;
          }
          Modal.alert(this, {
            title: 'Backup restored',
            message: `${result.count} slot${result.count === 1 ? '' : 's'} restored. Reload the page or return to the title screen to see the saves.`,
          });
        },
      });
    }).catch(() => {
      // Picker dismissed — silent.
    });
  }

  /** Compact ON/OFF pill. `rightX` is the right edge the toggle should align to. */
  private addToggle(rightX: number, y: number, value: boolean, onChange: (next: boolean) => void) {
    const w = 80;
    const btn = new Button({
      scene: this,
      x: rightX - w / 2,
      y,
      width: w,
      height: 28,
      label: value ? 'ON' : 'OFF',
      bg: value ? 0x3d6a92 : 0x223046,
      bgHover: value ? 0x4a7da8 : 0x2d4a6a,
      textColor: value ? '#e8eef5' : '#9bb0c4',
      onClick: () => onChange(!value),
    });
    this.content.add(btn);
  }
}
