import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { GameState } from '../state/GameState';
import { Plane } from '../state/Plane';
import { Tooltip } from '../ui/Tooltip';
import { formatMoney } from '../systems/Clock';
import { staffShortfall } from '../systems/Personnel';
import { portfolioValue } from '../systems/Stocks';
import { getCity } from '../state/catalog';

interface RoomDef {
  id: string;
  sceneKey: string;
  name: string;
  /** x, y, w, h relative to airport floor area. */
  rect: { x: number; y: number; w: number; h: number };
  color: number;
  desc: string;
  available: boolean;
  /** Single emoji or unicode glyph rendered as a soft watermark on the room
   *  tile — gives each room a visual identity beyond the colored rectangle. */
  icon: string;
  /** Backing Phaser rect set during drawRoom — used for tooltip + hotkey wiring. */
  shape?: Phaser.GameObjects.Rectangle;
}

export class AirportScene extends Phaser.Scene {
  private rooms: RoomDef[] = [
    { id: 'office',   sceneKey: 'OfficeScene',       name: 'Office',         rect: { x: 60,  y: 100, w: 240, h: 130 }, color: 0x2d4a6a, desc: 'Overview, fleet, and routes',     available: true, icon: '🏢' },
    { id: 'travel',   sceneKey: 'TravelAgencyScene', name: 'Travel Agency',  rect: { x: 320, y: 100, w: 240, h: 130 }, color: 0x355a7d, desc: 'Open and assign routes',          available: true, icon: '✈' },
    { id: 'shop',     sceneKey: 'WorkshopScene',     name: 'Workshop',       rect: { x: 580, y: 100, w: 240, h: 130 }, color: 0x2d4a6a, desc: 'Buy planes, repair, refit',       available: true, icon: '🔧' },
    { id: 'bank',     sceneKey: 'BankScene',         name: 'Bank',           rect: { x: 840, y: 100, w: 240, h: 130 }, color: 0x355a7d, desc: 'Loans, accounts, savings',         available: true, icon: '🏦' },
    { id: 'hr',       sceneKey: 'PersonnelScene',    name: 'Personnel',      rect: { x: 60,  y: 260, w: 240, h: 130 }, color: 0x355a7d, desc: 'Hire pilots and mechanics',        available: true, icon: '👥' },
    { id: 'stocks',   sceneKey: 'StocksScene',       name: 'Stock Market',   rect: { x: 320, y: 260, w: 240, h: 130 }, color: 0x2d4a6a, desc: 'Trade airline shares',             available: true, icon: '📊' },
    { id: 'tower',    sceneKey: 'WorldMapScene',     name: 'Control Tower',  rect: { x: 580, y: 260, w: 240, h: 130 }, color: 0x355a7d, desc: 'Live world map of all flights',    available: true, icon: '🌐' },
    { id: 'news',     sceneKey: 'NewsScene',         name: 'News Stand',     rect: { x: 840, y: 260, w: 240, h: 130 }, color: 0x355a7d, desc: 'Industry news and rumors',         available: true, icon: '📰' },
    { id: 'cargo',    sceneKey: 'CargoScene',        name: 'Cargo Hall',     rect: { x: 60,  y: 420, w: 240, h: 130 }, color: 0x2d4a6a, desc: 'Freight contracts',                available: true, icon: '📦' },
    { id: 'security', sceneKey: 'SecurityScene',     name: 'Security',       rect: { x: 320, y: 420, w: 240, h: 130 }, color: 0x355a7d, desc: 'Sabotage missions and defense',    available: true, icon: '🛡' },
    { id: 'duty',     sceneKey: 'DutyFreeScene',     name: 'Duty Free',      rect: { x: 580, y: 420, w: 240, h: 130 }, color: 0x2d4a6a, desc: 'Buy items and boosts',             available: true, icon: '🛒' },
    { id: 'lounge',   sceneKey: 'LoungeScene',       name: 'VIP Lounge',     rect: { x: 840, y: 420, w: 240, h: 130 }, color: 0x2d4a6a, desc: 'Meet contacts, intrigue',          available: true, icon: '🥂' },
  ];

  // Apron / runway geometry.
  private readonly apronY = 600;
  private readonly runwayY = 680;
  private readonly gateXs = [120, 260, 400, 540, 680, 820, 960, 1100];
  private readonly RUNWAY_LEFT = 80;
  private readonly RUNWAY_RIGHT = GAME_WIDTH - 80;

  private parkedLayer!: Phaser.GameObjects.Container;
  private flightLayer!: Phaser.GameObjects.Container;
  /** Strip below the apron showing one tag per flight currently outbound or
   *  inbound for the active hub — fills the visual gap between bursts. */
  private transitLayer!: Phaser.GameObjects.Container;
  private transitSig = '';
  private tooltip!: Tooltip;
  /** Title strip — updated when activeHub changes so the airport reflects
   *  whichever hub the player is currently focused on. */
  private titleText!: Phaser.GameObjects.Text;
  /** Last activeHub seen — when it changes we refresh the title. */
  private lastActiveHub: string | null = null;
  /** Plane ids currently mid-animation (suppressed from the parked layer). */
  private animatingIds = new Set<string>();
  /** Status snapshot per plane id from the previous frame, to detect transitions. */
  private lastStatuses: Record<string, string> = {};
  /** Visual gate index assigned to each parked plane id — reused by takeoff
   *  animations so the plane departs from the gate the player saw it at. */
  private gateByPlaneId = new Map<string, number>();
  /** Signature of the last drawn parked layer (id+gate tuples). Skips
   *  rebuild when nothing changed. */
  private parkedSig = '';

  constructor() { super('AirportScene'); }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Floor
    const floorTop = 60;
    this.add
      .rectangle(GAME_WIDTH / 2, floorTop + (GAME_HEIGHT - 60 - 60) / 2, GAME_WIDTH - 40, GAME_HEIGHT - 60 - 60, COLORS.floor)
      .setStrokeStyle(2, COLORS.wallLight);

    // Title strip — reflects the active hub so the airport feels like the
    // place the player is currently operating from.
    this.titleText = this.add.text(GAME_WIDTH / 2, floorTop + 20, this.titleForActiveHub(), {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '15px',
      color: COLORS.textDim,
    }).setOrigin(0.5);
    this.lastActiveHub = GameState.get().activeHub;

    // Rooms
    for (const room of this.rooms) {
      this.drawRoom(room);
    }

    // Apron + runway visual.
    this.drawApronAndRunway();

    // Layers for plane sprites (parked & flight animations) + in-transit
    // tag strip that lives below the apron.
    this.parkedLayer = this.add.container(0, 0);
    this.flightLayer = this.add.container(0, 0);
    this.transitLayer = this.add.container(0, 0);

    // Tooltip used for live room state on hover.
    this.tooltip = new Tooltip(this);

    // Attach tooltips + keyboard shortcuts after rooms are drawn.
    this.attachRoomTooltips();
    this.bindRoomHotkeys();

    // Snapshot status now and on every resume so room visits don't trigger
    // a flurry of takeoffs/landings on return.
    this.snapshotStatuses();
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.snapshotStatuses());
    this.events.on(Phaser.Scenes.Events.WAKE,   () => this.snapshotStatuses());

    // Bottom-left help text
    this.add.text(20, GAME_HEIGHT - 50, 'Click a room to enter, or press 1-9 / 0 / - / =. ESC to leave a room.', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '12px',
      color: COLORS.textDim,
    });
  }

  update() {
    this.checkStatusChanges();
    this.drawParkedPlanes();
    this.drawInTransit();
    this.refreshTitleIfHubChanged();
  }

  /**
   * Strip below the apron listing every flight currently outbound from or
   * inbound to the active hub. Fills the "all my planes are mid-flight, the
   * apron looks dead" gap by giving the player something to read while they
   * wait for the next landing animation. Sig-cached so it only rebuilds when
   * the set of in-transit destinations changes.
   */
  private drawInTransit() {
    const state = GameState.get();
    const me = state.human;
    const hub = state.activeHub;

    const flights: Array<{ direction: '→' | '←'; otherCity: string }> = [];
    for (const plane of me.planes) {
      const s = plane.status;
      if (s.kind === 'flying' || s.kind === 'cargo' || s.kind === 'ferry') {
        if (s.from === hub) flights.push({ direction: '→', otherCity: s.to });
        else if (s.to === hub) flights.push({ direction: '←', otherCity: s.from });
      }
    }

    const sig = flights.map(f => `${f.direction}${f.otherCity}`).join('|');
    if (sig === this.transitSig) return;
    this.transitSig = sig;

    this.transitLayer.removeAll(true);
    if (flights.length === 0) return;

    const stripY = this.apronY + 45;
    const header = this.add.text(80, stripY, 'IN TRANSIT', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '10px',
      color: '#9bb0c4',
      fontStyle: 'bold',
    });
    this.transitLayer.add(header);

    let x = 170;
    for (const f of flights) {
      const cityName = getCity(f.otherCity).name;
      const tag = this.add.text(x, stripY, `${f.direction} ${cityName}`, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
        color: f.direction === '→' ? '#ffc857' : '#7be08a',
      });
      this.transitLayer.add(tag);
      x += tag.width + 18;
    }
  }

  /** Build the title strip label for the current active hub. */
  private titleForActiveHub(): string {
    const city = getCity(GameState.get().activeHub);
    return `${city.name} ${city.country === 'USA' && city.id === 'hnl' ? 'International' : ''}— Terminal A`.replace('  ', ' ');
  }

  /** If the active hub has been switched (in Travel Agency or World Map),
   *  rewrite the title strip on the next tick instead of restarting the scene. */
  private refreshTitleIfHubChanged() {
    const cur = GameState.get().activeHub;
    if (cur === this.lastActiveHub) return;
    this.lastActiveHub = cur;
    this.titleText.setText(this.titleForActiveHub());
    this.parkedSig = '';   // force parked-plane layout to recompute (gates may differ)
  }

  // ----- Room tile rendering -----
  private drawRoom(room: RoomDef) {
    const { x, y, w, h } = room.rect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const baseColor = room.available ? room.color : 0x1c2c40;

    const rect = this.add.rectangle(cx, cy, w, h, baseColor).setStrokeStyle(2, COLORS.roomBorder, room.available ? 1 : 0.4);
    room.shape = rect;

    // Left edge accent bar — gives each tile a vertical "stripe" of identity.
    this.add.rectangle(x + 3, cy, 4, h - 6, COLORS.accent, room.available ? 0.85 : 0.3).setOrigin(0.5);

    // Watermark icon — big and faint, sits as a backdrop behind the title text.
    this.add.text(cx, cy - 38, room.icon, {
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI Symbol, Segoe UI, Tahoma, sans-serif',
      fontSize: '30px',
      color: '#ffffff',
    }).setOrigin(0.5).setAlpha(room.available ? 0.85 : 0.3);

    this.add.text(cx, cy + 6, room.name, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '16px',
      color: room.available ? COLORS.accentText : '#7a8aa0',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, cy + 28, room.desc, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '11px',
      color: room.available ? COLORS.text : '#7a8aa0',
      align: 'center',
      wordWrap: { width: w - 24 },
    }).setOrigin(0.5);
    if (!room.available) {
      this.add.text(cx, cy + 50, '— coming soon —', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
        color: '#5a6a80',
        fontStyle: 'italic',
      }).setOrigin(0.5);
    }

    if (!room.available) return;

    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => rect.setFillStyle(COLORS.roomHover));
    rect.on('pointerout',  () => rect.setFillStyle(baseColor));
    rect.on('pointerdown', () => this.enterRoom(room));
  }

  private enterRoom(room: RoomDef) {
    if (!room.available) return;
    this.scene.pause();
    this.scene.launch(room.sceneKey);
  }

  // ----- Room interactivity (tooltips + hotkeys) -----

  /** Attach a live-state hover tooltip to each available room. */
  private attachRoomTooltips() {
    for (const room of this.rooms) {
      if (!room.available || !room.shape) continue;
      this.tooltip.attach(room.shape, () => this.roomTooltip(room));
    }
  }

  /** Bind 1-9 / 0 / - / = to enter the rooms in declaration order. */
  private bindRoomHotkeys() {
    const keys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO', 'MINUS', 'PLUS'];
    keys.forEach((key, i) => {
      const room = this.rooms[i];
      if (!room) return;
      this.input.keyboard?.on(`keydown-${key}`, () => this.enterRoom(room));
    });
  }

  /** Build a multi-line tooltip with current state for the given room. */
  private roomTooltip(room: RoomDef): string {
    const s = GameState.get();
    const me = s.human;
    const counts = { idle: 0, flying: 0, cargo: 0, maintenance: 0, ferry: 0 };
    for (const p of me.planes) counts[p.status.kind]++;

    switch (room.id) {
      case 'office':
        return `Office\nFleet: ${me.planes.length}  ·  Routes: ${me.routes.length}\n`
             + `Idle ${counts.idle}  Flying ${counts.flying}  Cargo ${counts.cargo}  Maint ${counts.maintenance}`;
      case 'travel':
        return `Travel Agency\n${me.routes.length} route${me.routes.length === 1 ? '' : 's'} on the books`;
      case 'shop':
        return `Workshop\nBuy planes, repair, refit\n${counts.maintenance} in maintenance`;
      case 'bank':
        return `Bank\nCash: ${formatMoney(me.cash)}\nLoan: ${formatMoney(me.loan)}  ·  Savings: ${formatMoney(me.savings)}`;
      case 'hr': {
        const cap = Math.min(me.pilots, me.mechanics);
        const shortfall = staffShortfall(me);
        const base = `Personnel\n${me.pilots} pilots, ${me.mechanics} mechanics  (cap ${cap})`;
        return shortfall > 0 ? `${base}\n⚠ ${shortfall} grounded — hire crew` : base;
      }
      case 'stocks':
        return `Stock Market\nPortfolio value: ${formatMoney(portfolioValue(me))}`;
      case 'tower':
        return `Control Tower\nLive world map\n${counts.flying + counts.cargo} of yours airborne`;
      case 'news':
        return `News Stand\n${s.news.length} item${s.news.length === 1 ? '' : 's'} in the feed`;
      case 'cargo':
        return `Cargo Hall\n${s.cargoOffers.length} offer${s.cargoOffers.length === 1 ? '' : 's'}  ·  ${s.cargoActive.length} active`;
      case 'security':
        return `Security\nSabotage missions and defense`;
      case 'duty':
        return `Duty Free\nBuy items and boosts`;
      case 'lounge':
        return `VIP Lounge\n${s.loungeContacts.length} contact${s.loungeContacts.length === 1 ? '' : 's'} today`;
      default:
        return `${room.name}\n${room.desc}`;
    }
  }

  // ----- Apron + runway visuals -----
  private drawApronAndRunway() {
    const left = this.RUNWAY_LEFT, right = this.RUNWAY_RIGHT;
    const cx = (left + right) / 2;

    // Apron tarmac — lighter so it pops against the floor.
    this.add.rectangle(cx, this.apronY, right - left + 40, 64, 0x2c3e54).setStrokeStyle(1, 0x4a6a8c);

    // Gate stalls — visible boxes with gate numbers.
    this.gateXs.forEach((gx, i) => {
      this.add.rectangle(gx, this.apronY + 18, 56, 26, 0x1f2e42).setStrokeStyle(1, 0x4a6a8c, 0.8);
      this.add.text(gx, this.apronY + 18, `G${i + 1}`, {
        fontFamily: 'Segoe UI', fontSize: '11px', color: '#7a8aa0',
      }).setOrigin(0.5);
    });

    // "GATES" label
    this.add.text(left, this.apronY - 38, 'GATES',
      { fontFamily: 'Segoe UI', fontSize: '11px', color: '#9bb0c4', fontStyle: 'bold' });

    // Runway base — dark
    this.add.rectangle(cx, this.runwayY, right - left, 36, 0x111d2c).setStrokeStyle(1, 0x4a6a8c);

    // Threshold "piano keys" at each end of the runway.
    for (let i = 0; i < 5; i++) {
      this.add.rectangle(left + 18, this.runwayY - 12 + i * 6, 22, 4, 0xd8e4f0).setOrigin(0, 0);
      this.add.rectangle(right - 18 - 22, this.runwayY - 12 + i * 6, 22, 4, 0xd8e4f0).setOrigin(0, 0);
    }

    // Big runway designators painted near each end. 26R on the left
    // (planes landing here are heading 260°), 08L on the right (heading 080°).
    this.add.text(left + 70, this.runwayY, '26R', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '20px',
      color: '#d8e4f0',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.add.text(right - 70, this.runwayY, '08L', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '20px',
      color: '#d8e4f0',
      fontStyle: 'bold',
    }).setOrigin(1, 0.5);

    // Centerline dashes
    for (let x = left + 130; x < right - 130; x += 60) {
      this.add.rectangle(x, this.runwayY, 30, 2, 0xa0b8d0);
    }

    // Runway label
    this.add.text(cx, this.runwayY + 26, 'RUNWAY 08L / 26R', {
      fontFamily: 'Segoe UI', fontSize: '10px', color: '#9bb0c4', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
  }

  // ----- Status polling for animations -----
  private snapshotStatuses() {
    const me = GameState.get().human;
    for (const plane of me.planes) {
      this.lastStatuses[plane.id] = plane.status.kind;
    }
  }

  private checkStatusChanges() {
    const state = GameState.get();
    const me = state.human;
    const hub = state.activeHub;
    for (const plane of me.planes) {
      const cur = plane.status.kind;
      const prev = this.lastStatuses[plane.id];
      if (prev === undefined) {
        this.lastStatuses[plane.id] = cur;
        continue;
      }
      // Only animate takeoffs/landings that involve the hub the player is
      // currently watching. A plane based in LAX takes off invisibly here.
      if (prev === 'idle' && (cur === 'flying' || cur === 'cargo' || cur === 'ferry')) {
        if ((plane.status.kind === 'flying' || plane.status.kind === 'cargo' || plane.status.kind === 'ferry')
            && plane.status.from === hub) {
          this.animateTakeoff(plane);
        }
      } else if ((prev === 'flying' || prev === 'cargo' || prev === 'ferry') && cur === 'idle') {
        if (plane.status.kind === 'idle' && plane.status.airportId === hub) {
          this.animateLanding(plane);
        }
      }
      this.lastStatuses[plane.id] = cur;
    }
  }

  private drawParkedPlanes() {
    const state = GameState.get();
    const me = state.human;
    // Only planes parked at the currently-shown hub appear on its apron.
    const idle = me.planes.filter(p =>
      p.status.kind === 'idle'
      && p.status.airportId === state.activeHub
      && !this.animatingIds.has(p.id)
    );

    // Build (id, gateIdx) tuples + a signature; skip rebuild if unchanged.
    const tuples: Array<{ plane: Plane; gateIdx: number }> = idle.map((plane, i) => ({
      plane,
      gateIdx: i % this.gateXs.length,
    }));
    const sig = tuples.map(t => `${t.plane.id}@${t.gateIdx}`).join('|');
    if (sig === this.parkedSig) return;

    this.parkedSig = sig;
    this.parkedLayer.removeAll(true);
    this.gateByPlaneId.clear();
    for (const { plane, gateIdx } of tuples) {
      this.gateByPlaneId.set(plane.id, gateIdx);
      const icon = this.makePlaneIcon(this.gateXs[gateIdx], this.apronY, plane.model.seats, me.color, 0);
      this.parkedLayer.add(icon);
    }
  }

  // ----- Animations -----

  /** Stable gate index for a plane — prefers the visual gate set by drawParkedPlanes
   *  so takeoff lifts off from the gate the player saw, not a different one
   *  derived from raw planes[] index. Falls back when not yet recorded. */
  private gateIndexFor(plane: Plane): number {
    const recorded = this.gateByPlaneId.get(plane.id);
    if (recorded !== undefined) return recorded;
    const i = GameState.get().human.planes.indexOf(plane);
    return Math.max(0, i) % this.gateXs.length;
  }

  private animateTakeoff(plane: Plane) {
    const me = GameState.get().human;
    const seats = plane.model.seats;
    const gateIdx = this.gateIndexFor(plane);
    const gateX = this.gateXs[gateIdx];
    // Alternate runway end so neighboring gates don't trace the same path
    // when two planes take off near-simultaneously.
    const exitsRight = (gateIdx % 2) === 0;

    this.animatingIds.add(plane.id);
    const startRot = exitsRight ? 0 : Math.PI;
    const icon = this.makePlaneIcon(gateX, this.apronY, seats, me.color, startRot);
    icon.setScale(1.3); // bigger during animation for visibility
    this.flightLayer.add(icon);

    const thresholdX = exitsRight ? this.RUNWAY_LEFT + 50 : this.RUNWAY_RIGHT - 50;
    const exitX = exitsRight ? GAME_WIDTH + 80 : -80;

    // Phase 0: BOARDING. Plane sits at gate while a small bar above it fills,
    // selling the "passengers loading" beat before taxi starts.
    const boarding = this.boardingProgress(gateX, this.apronY - 24, '#ffc857', 'BOARDING');
    this.tweens.add({
      targets: boarding.fill,
      scaleX: 1,
      duration: 800,
      ease: 'Linear',
      onComplete: () => {
        boarding.destroy();
        this.flashLabel(gateX, this.apronY - 36, 'TAKEOFF', '#ffc857');

        // Phase 1: taxi from gate to the runway threshold.
        this.tweens.add({
          targets: icon,
          x: thresholdX,
          y: this.runwayY,
          duration: 1000,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            // Phase 2: accelerate down the runway and exit.
            this.tweens.add({
              targets: icon,
              x: exitX,
              duration: 1200,
              ease: 'Cubic.easeIn',
              onComplete: () => {
                icon.destroy();
                this.animatingIds.delete(plane.id);
              },
            });
          },
        });
      },
    });
  }

  private animateLanding(plane: Plane) {
    const me = GameState.get().human;
    const seats = plane.model.seats;
    const gateIdx = this.gateIndexFor(plane);
    const gateX = this.gateXs[gateIdx];
    // Match takeoff convention so each plane uses a consistent runway end.
    const entersFromRight = (gateIdx % 2) === 0;

    this.animatingIds.add(plane.id);
    const startX = entersFromRight ? GAME_WIDTH + 80 : -80;
    const flightRot = entersFromRight ? Math.PI : 0;
    const icon = this.makePlaneIcon(startX, this.runwayY, seats, me.color, flightRot);
    icon.setScale(1.3);
    this.flightLayer.add(icon);

    this.flashLabel(gateX, this.apronY - 36, 'LANDING', '#7be08a');

    const thresholdX = entersFromRight ? this.RUNWAY_LEFT + 50 : this.RUNWAY_RIGHT - 50;

    // Phase 1: enter from one end of the runway, decelerate to the threshold.
    this.tweens.add({
      targets: icon,
      x: thresholdX,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        // Phase 2: taxi to a gate and rotate to parked orientation.
        this.tweens.add({
          targets: icon,
          x: gateX,
          y: this.apronY,
          rotation: 0,
          duration: 1000,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            // Phase 3: DEPLANING. A short bar empties above the parked plane
            // before it disappears back into the parked-layer pool — sells the
            // "passengers off, plane resets" beat.
            const deplane = this.boardingProgress(gateX, this.apronY - 24, '#7be08a', 'ARRIVED');
            // Bar starts full and drains.
            deplane.fill.scaleX = 1;
            this.tweens.add({
              targets: deplane.fill,
              scaleX: 0,
              duration: 600,
              ease: 'Linear',
              onComplete: () => {
                deplane.destroy();
                icon.destroy();
                this.animatingIds.delete(plane.id);
              },
            });
          },
        });
      },
    });
  }

  /**
   * Progress-bar widget above the apron, with a label. Used for both BOARDING
   * (filling) and ARRIVED/deplaning (draining).
   *
   * Caller tweens `fill.scaleX` between 0 and 1 — `Rectangle.width` doesn't
   * cause Phaser to re-emit geometry, but `scaleX` is applied every frame at
   * the transform stage, so the bar visibly grows/shrinks. The fill rect is
   * left-anchored (origin 0, 0.5) so scaling extends from the left edge.
   */
  private boardingProgress(x: number, y: number, color: string, label: string): {
    fill: Phaser.GameObjects.Rectangle;
    destroy: () => void;
  } {
    const maxWidth = 38;
    const h = 5;
    const colorNum = parseInt(color.replace('#', ''), 16);
    const bg = this.add.rectangle(x, y, maxWidth, h, 0x223046).setStrokeStyle(1, 0x4a6a8c, 0.8);
    const fill = this.add
      .rectangle(x - maxWidth / 2, y, maxWidth, h, colorNum)
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    const txt = this.add.text(x, y - 14, label, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '10px',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.flightLayer.add(bg);
    this.flightLayer.add(fill);
    this.flightLayer.add(txt);
    return {
      fill,
      destroy: () => { bg.destroy(); fill.destroy(); txt.destroy(); },
    };
  }

  /** Small text label that fades after a beat — calls out takeoff/landing. */
  private flashLabel(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.flightLayer.add(t);
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: y - 18,
      duration: 1800,
      ease: 'Sine.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  // ----- Plane icon helper -----
  private makePlaneIcon(x: number, y: number, seats: number, color: number, rotationRad: number): Phaser.GameObjects.Graphics {
    const size = 4 + Math.sqrt(seats) * 0.6;
    const g = this.add.graphics({ x, y });
    const s = size;
    // Soft drop shadow — subtle depth cue under parked + animating planes.
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(s * 0.15, s * 0.45, s * 2.6, s * 1.4);
    g.fillStyle(color, 1);
    g.lineStyle(1, 0x000000, 0.7);
    // Fuselage
    g.beginPath();
    g.moveTo( s * 1.2, 0);
    g.lineTo(-s * 0.6, s * 0.18);
    g.lineTo(-s * 1.0, s * 0.18);
    g.lineTo(-s * 1.0, -s * 0.18);
    g.lineTo(-s * 0.6, -s * 0.18);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // Wings
    g.beginPath();
    g.moveTo( s * 0.0, 0);
    g.lineTo(-s * 0.4,  s * 0.95);
    g.lineTo(-s * 0.6,  s * 0.95);
    g.lineTo(-s * 0.3,  0);
    g.lineTo(-s * 0.6, -s * 0.95);
    g.lineTo(-s * 0.4, -s * 0.95);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // Tail fin
    g.beginPath();
    g.moveTo(-s * 0.85, 0);
    g.lineTo(-s * 1.1,  s * 0.4);
    g.lineTo(-s * 1.2,  s * 0.4);
    g.lineTo(-s * 1.0,  0);
    g.lineTo(-s * 1.2, -s * 0.4);
    g.lineTo(-s * 1.1, -s * 0.4);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.rotation = rotationRad;
    return g;
  }
}
