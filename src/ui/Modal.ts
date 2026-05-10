import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { Button } from './Button';
import { sound } from '../systems/Sound';

/**
 * Custom modal system — replaces every `window.alert` / `window.prompt` /
 * `window.confirm` with a Phaser-rendered overlay that matches the rest of
 * the game's look.
 *
 * Three flavors:
 *   `Modal.alert(scene, opts)`    — single OK button.
 *   `Modal.confirm(scene, opts)`  — Cancel + OK.
 *   `Modal.prompt(scene, opts)`   — text input + Cancel + Submit.
 *
 * Keyboard:
 *   Enter   → primary action (OK / Submit).
 *   Escape  → cancel.
 *
 * Only one modal is shown at a time; opening a new one dismisses any prior.
 *
 * Input handling: keydown is captured at the `window` level in capture phase
 * with `stopImmediatePropagation` so Phaser scene shortcuts (ESC closes the
 * room, etc.) don't double-fire while a modal is open.
 */

interface ModalHandle {
  cleanup: () => void;
}

let activeHandle: ModalHandle | null = null;

interface AlertOpts {
  title: string;
  message: string;
  ok?: string;
  onClose?: () => void;
}

interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface PromptOpts {
  title: string;
  message: string;
  default?: string;
  placeholder?: string;
  minLen?: number;
  maxLen?: number;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}

export class Modal {
  static alert(scene: Phaser.Scene, opts: AlertOpts): void {
    Modal.dismiss();
    const W = 440, H = 200;
    const root = buildRoot(scene, W, H);
    drawTitle(scene, root, W, opts.title);
    drawMessage(scene, root, W, opts.message, 30, 88);
    const close = () => { Modal.dismiss(); opts.onClose?.(); };
    const okBtn = new Button({
      scene,
      x: 0, y: H / 2 - 32,
      width: 140, height: 36,
      label: opts.ok ?? 'OK',
      onClick: close,
    });
    root.add(okBtn);
    activeHandle = wireKeyboard(scene, root, close, close);
  }

  static confirm(scene: Phaser.Scene, opts: ConfirmOpts): void {
    Modal.dismiss();
    const W = 480, H = 220;
    const root = buildRoot(scene, W, H);
    drawTitle(scene, root, W, opts.title);
    drawMessage(scene, root, W, opts.message, 30, 88);
    const onCancel = () => { Modal.dismiss(); opts.onCancel?.(); };
    const onConfirm = () => { Modal.dismiss(); opts.onConfirm(); };
    const cancelBtn = new Button({
      scene,
      x: -90, y: H / 2 - 32,
      width: 140, height: 36,
      label: opts.cancelLabel ?? 'Cancel',
      bg: 0x223046,
      bgHover: 0x2d4a6a,
      onClick: onCancel,
    });
    const confirmBtn = new Button({
      scene,
      x: 90, y: H / 2 - 32,
      width: 140, height: 36,
      label: opts.confirmLabel ?? 'OK',
      bg: opts.destructive ? 0x6a2a3c : 0x2d4a6a,
      bgHover: opts.destructive ? 0x8a3a4c : 0x3d6a92,
      onClick: onConfirm,
    });
    root.add([cancelBtn, confirmBtn]);
    activeHandle = wireKeyboard(scene, root, onConfirm, onCancel);
  }

  static prompt(scene: Phaser.Scene, opts: PromptOpts): void {
    Modal.dismiss();
    const W = 520, H = 250;
    const root = buildRoot(scene, W, H);
    drawTitle(scene, root, W, opts.title);
    drawMessage(scene, root, W, opts.message, 30, 88);

    const minLen = opts.minLen ?? 1;
    const maxLen = opts.maxLen ?? 64;
    let value = opts.default ?? '';
    let errorText: Phaser.GameObjects.Text | null = null;

    // Input field — rectangle + text + blinking cursor.
    const fieldW = W - 60;
    const fieldH = 38;
    const fieldY = 0;
    const fieldBg = scene.add
      .rectangle(0, fieldY, fieldW, fieldH, 0x14304a)
      .setStrokeStyle(2, 0xffc857);
    const inputText = scene.add
      .text(-fieldW / 2 + 10, fieldY, value || '', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '15px',
        color: '#e8eef5',
      })
      .setOrigin(0, 0.5);
    const placeholder = scene.add
      .text(-fieldW / 2 + 10, fieldY, opts.placeholder ?? '', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '15px',
        color: '#5a6a80',
        fontStyle: 'italic',
      })
      .setOrigin(0, 0.5)
      .setVisible(value.length === 0);
    const cursor = scene.add
      .text(-fieldW / 2 + 10 + Math.ceil(inputText.width), fieldY, '|', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '15px',
        color: '#ffc857',
      })
      .setOrigin(0, 0.5);
    root.add([fieldBg, inputText, placeholder, cursor]);

    const cursorTween = scene.tweens.add({
      targets: cursor,
      alpha: 0,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    const refreshField = () => {
      inputText.setText(value);
      placeholder.setVisible(value.length === 0);
      cursor.x = -fieldW / 2 + 10 + Math.ceil(inputText.width);
    };

    const showError = (msg: string) => {
      if (errorText) errorText.destroy();
      errorText = scene.add.text(0, 36, msg, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '12px',
        color: '#ff9aa6',
      }).setOrigin(0.5);
      root.add(errorText);
    };

    const onCancel = () => {
      cursorTween.stop();
      Modal.dismiss();
      opts.onCancel?.();
    };
    const onSubmit = () => {
      const trimmed = value.trim();
      if (trimmed.length < minLen) {
        showError(`Must be at least ${minLen} character${minLen === 1 ? '' : 's'}.`);
        return;
      }
      if (trimmed.length > maxLen) {
        showError(`Must be at most ${maxLen} characters.`);
        return;
      }
      cursorTween.stop();
      Modal.dismiss();
      opts.onSubmit(trimmed);
    };

    const cancelBtn = new Button({
      scene,
      x: -90, y: H / 2 - 32,
      width: 140, height: 36,
      label: opts.cancelLabel ?? 'Cancel',
      bg: 0x223046,
      bgHover: 0x2d4a6a,
      onClick: onCancel,
    });
    const submitBtn = new Button({
      scene,
      x: 90, y: H / 2 - 32,
      width: 140, height: 36,
      label: opts.submitLabel ?? 'OK',
      onClick: onSubmit,
    });
    root.add([cancelBtn, submitBtn]);

    // Per-modal key handler — handles printable input plus Enter/Esc/Backspace.
    const keyHandler = (event: KeyboardEvent) => {
      if (!activeHandle) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onSubmit();
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (value.length > 0) {
          value = value.slice(0, -1);
          refreshField();
        }
        return;
      }
      // Printable single character
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (value.length < maxLen) {
          value += event.key;
          refreshField();
        }
      }
    };

    activeHandle = wireKeyboard(scene, root, onSubmit, onCancel, keyHandler);
  }

  static dismiss(): void {
    activeHandle?.cleanup();
    activeHandle = null;
  }

  /** True while any modal is open. Use sparingly; modals own their own input. */
  static isOpen(): boolean {
    return activeHandle !== null;
  }
}

// ---------- internals ----------

/**
 * Build the modal scaffolding: full-screen dim backdrop + centered panel
 * container at (cx, cy). Returns the centered container; children drawn at
 * (0, 0) sit at panel center.
 */
function buildRoot(scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Container {
  const cx = scene.scale.width / 2;
  const cy = scene.scale.height / 2;

  const backdrop = scene.add
    .rectangle(scene.scale.width / 2, scene.scale.height / 2, scene.scale.width, scene.scale.height, 0x000000, 0.55)
    .setInteractive();
  // Swallow clicks so the underlying scene doesn't see them.
  backdrop.on('pointerdown', () => {});

  const panel = scene.add
    .rectangle(0, 0, w, h, COLORS.panel, 1)
    .setStrokeStyle(2, COLORS.panelBorder);

  const accent = scene.add
    .rectangle(0, -h / 2 + 4, w, 4, COLORS.accent);

  const container = scene.add.container(cx, cy, [panel, accent]);
  container.setDepth(50_000);
  // Animate in.
  container.setScale(0.94);
  container.setAlpha(0);
  scene.tweens.add({
    targets: container,
    alpha: 1,
    scale: 1,
    duration: 180,
    ease: 'Sine.easeOut',
  });
  scene.tweens.add({
    targets: backdrop,
    alpha: { from: 0, to: 0.55 },
    duration: 180,
    ease: 'Sine.easeOut',
  });

  // Stash the backdrop on the container so cleanup can find it.
  (container as Phaser.GameObjects.Container & { _modalBackdrop?: Phaser.GameObjects.Rectangle })
    ._modalBackdrop = backdrop;

  // Ignore unused locals (cx/cy used for container position).
  void cx; void cy;
  return container;
}

function drawTitle(scene: Phaser.Scene, root: Phaser.GameObjects.Container, w: number, title: string) {
  const t = scene.add.text(0, -GAME_HEIGHT, '', {});
  t.destroy();   // (no-op — kept to silence "GAME_WIDTH unused" if it sneaks in)
  void GAME_WIDTH;
  const titleObj = scene.add.text(0, -panelH(root) / 2 + 26, title, {
    fontFamily: 'Segoe UI, Tahoma, sans-serif',
    fontSize: '18px',
    color: COLORS.accentText,
    fontStyle: 'bold',
    align: 'center',
    wordWrap: { width: w - 40 },
  }).setOrigin(0.5);
  root.add(titleObj);
}

function drawMessage(
  scene: Phaser.Scene, root: Phaser.GameObjects.Container, w: number,
  message: string, sidePad: number, _topY: number,
) {
  const msg = scene.add.text(0, -10, message, {
    fontFamily: 'Segoe UI, Tahoma, sans-serif',
    fontSize: '13px',
    color: COLORS.text,
    align: 'center',
    wordWrap: { width: w - sidePad * 2 },
  }).setOrigin(0.5);
  root.add(msg);
}

function panelH(root: Phaser.GameObjects.Container): number {
  // Panel is the first child; height set when constructed.
  const panel = root.list[0] as Phaser.GameObjects.Rectangle;
  return panel.height;
}

/**
 * Wire up keyboard handling for the modal. Always handles Enter (primary)
 * and Escape (cancel) at the window-capture level so scene shortcuts can't
 * fire underneath. Optional `customHandler` receives all keydown events for
 * input-style modals (prompt).
 */
function wireKeyboard(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  onPrimary: () => void,
  onCancel: () => void,
  customHandler?: (e: KeyboardEvent) => void,
): ModalHandle {
  const handler = (event: KeyboardEvent) => {
    if (customHandler) {
      customHandler(event);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopImmediatePropagation();
      onPrimary();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    }
  };
  window.addEventListener('keydown', handler, true);

  return {
    cleanup: () => {
      window.removeEventListener('keydown', handler, true);
      const backdrop = (root as Phaser.GameObjects.Container & {
        _modalBackdrop?: Phaser.GameObjects.Rectangle
      })._modalBackdrop;
      // Animate out, then destroy.
      scene.tweens.add({
        targets: root,
        alpha: 0,
        scale: 0.94,
        duration: 140,
        ease: 'Sine.easeIn',
        onComplete: () => {
          root.destroy(true);
          backdrop?.destroy();
        },
      });
      sound.play('click');
    },
  };
}
