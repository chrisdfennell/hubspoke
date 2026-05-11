import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { GameState } from '../state/GameState';
import { Plane } from '../state/Plane';
import { Player } from '../state/Player';
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
  /** Leftmost / rightmost gate centers. Gates are spaced evenly between
   *  these. Picked so 8 gates land at the original 120 / 260 / ... / 1100
   *  positions; with 12 gates each step is ~89 px. */
  private readonly GATE_X_LEFT = 120;
  private readonly GATE_X_RIGHT = 1100;
  /** Mutable — recomputed by ensureGateLayout() whenever the active hub or
   *  its purchased gate count changes. */
  private gateXs: number[] = [];
  /** Key form: `${hubId}|${gateCount}`. Used to short-circuit re-layout when
   *  nothing relevant changed. */
  private gateLayoutKey = '';
  private gateBoxLayer!: Phaser.GameObjects.Container;
  private readonly RUNWAY_LEFT = 80;
  private readonly RUNWAY_RIGHT = GAME_WIDTH - 80;

  private parkedLayer!: Phaser.GameObjects.Container;
  private flightLayer!: Phaser.GameObjects.Container;
  /** Strip below the apron showing one tag per flight currently outbound or
   *  inbound for the active hub — fills the visual gap between bursts. */
  private transitLayer!: Phaser.GameObjects.Container;
  private transitSig = '';
  /** Rival planes visiting your active hub. Rendered in their airline color
   *  with a name label, in a slim row above the gates (separate from your
   *  numbered apron gates so visitor planes never conflict with your gate
   *  assignments). */
  private visitorLayer!: Phaser.GameObjects.Container;
  private visitorSig = '';
  /** Status snapshot of every rival plane the last time we polled — used
   *  to detect idle→flying / flying→idle transitions affecting this hub
   *  so we can animate visitor takeoffs/landings. */
  private rivalStatuses: Record<string, string> = {};
  /** Rival plane ids currently mid visitor-anim. Suppressed from the
   *  visitor-row render so the parked icon doesn't double with the
   *  animating icon. */
  private animatingRivalIds = new Set<string>();
  /** Visitor row y-coordinate (above the gate boxes, below the rooms). */
  private readonly VISITOR_Y = 568;
  private readonly VISITOR_X_LEFT = 200;
  private readonly VISITOR_X_RIGHT = 1000;
  private readonly MAX_VISITORS = 4;

  /** Tinted overlay covering apron + runway. Its color and alpha shift with
   *  the in-game hour so the airport reads dawn / day / dusk / night. */
  private skyOverlay!: Phaser.GameObjects.Rectangle;
  /** Container of small glowing dots along the runway edges. Alpha shifts
   *  with the daylight phase — invisible during midday, full at night. */
  private runwayLightsLayer!: Phaser.GameObjects.Container;
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
  /** Real-time (scene.time.now) at which each in-flight landing animation
   *  ends, keyed by plane id. animateTakeoff queries this to delay its
   *  BOARDING phase so the player doesn't see a plane begin boarding while
   *  a sibling plane is still taxiing in. */
  private activeLandingEndsAt = new Map<string, number>();
  /** Callbacks to fire when each in-flight landing animation completes,
   *  keyed by plane id. Used for the same-plane case where a takeoff is
   *  dispatched while THIS plane's own landing animation is still running
   *  (turnaround cooldown shorter than landing-anim duration at 2×/4×
   *  game speeds). Chaining off the landing's onComplete eliminates the
   *  1-frame gap that delayedCall would introduce. */
  private onLandingComplete = new Map<string, () => void>();
  /** Cap on how long a takeoff can wait for landings to finish. Without
   *  this, sustained 3-plane traffic at 4× speed produces a perpetually
   *  growing animation backlog. 4s = roughly one full takeoff cycle. */
  private readonly TAKEOFF_HOLD_CAP_MS = 4000;

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

    // Gate boxes go on their own layer beneath the planes so we can redraw
    // them when the active hub or its purchased gate count changes without
    // touching the rest of the apron art.
    this.gateBoxLayer = this.add.container(0, 0);
    // Layers for plane sprites (parked & flight animations) + in-transit
    // tag strip that lives below the apron.
    this.parkedLayer = this.add.container(0, 0);
    this.flightLayer = this.add.container(0, 0);
    this.transitLayer = this.add.container(0, 0);
    this.visitorLayer = this.add.container(0, 0);

    // Sky tint + runway lights live above the apron tarmac but below the
    // plane sprites + animations, so a night blue washes the runway base
    // without dimming the planes themselves into illegibility.
    this.skyOverlay = this.add
      .rectangle(0, 555, GAME_WIDTH, GAME_HEIGHT - 555, 0x000000, 0)
      .setOrigin(0);
    this.runwayLightsLayer = this.add.container(0, 0);
    this.buildRunwayLights();

    // Initial gate-box layout. Subsequent hub-switches and gate purchases
    // are picked up by ensureGateLayout() in update().
    this.ensureGateLayout();

    // Tooltip used for live room state on hover.
    this.tooltip = new Tooltip(this);

    // Attach tooltips + keyboard shortcuts after rooms are drawn.
    this.attachRoomTooltips();
    this.bindRoomHotkeys();

    // Seed lastStatuses ONCE at scene boot. The clock (in HUDScene) keeps
    // ticking while the AirportScene is paused for a room visit, so a plane
    // can transition idle→flying during a Travel Agency trip (the takeoff
    // sound plays from the dispatch system regardless of which scene is on
    // top). We deliberately do NOT re-snapshot on RESUME/WAKE — that erased
    // the prev='idle'/cur='flying' edge and left the player back at the
    // apron with no takeoff animation. Letting checkStatusChanges() detect
    // the edge on the first post-resume frame plays the animation slightly
    // late but visually intact.
    this.snapshotStatuses();

    // Bottom-left help text
    this.add.text(20, GAME_HEIGHT - 50, 'Click a room to enter, or press 1-9 / 0 / - / =. ESC to leave a room.', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '12px',
      color: COLORS.textDim,
    });
  }

  update() {
    this.ensureGateLayout();
    this.checkStatusChanges();
    this.checkRivalStatusChanges();
    this.drawParkedPlanes();
    this.drawVisitingPlanes();
    this.drawInTransit();
    this.refreshTitleIfHubChanged();
    this.updateDaylight();
  }

  /** Recompute gateXs + redraw gate boxes if the active hub changed or its
   *  purchased gate count changed since the last call. Cheap when unchanged
   *  — a single string compare. Called every frame from update() so that
   *  buying a gate (from the Travel Agency Airport tab) shows up next tick. */
  private ensureGateLayout() {
    const me = GameState.get().human;
    const hub = GameState.get().activeHub;
    const count = me.gatesAt(hub);
    const key = `${hub}|${count}`;
    if (key === this.gateLayoutKey) return;
    // Hub switch invalidates any gate assignments — planes "at" the previous
    // hub aren't relevant here, and a hub may have a different gate count.
    const hubChanged = !this.gateLayoutKey.startsWith(`${hub}|`);
    this.gateLayoutKey = key;
    if (hubChanged) this.gateByPlaneId.clear();

    // Evenly space gates between GATE_X_LEFT and GATE_X_RIGHT. With count=8
    // we recover the original 140-px spacing; count=12 gives ~89 px.
    this.gateXs = [];
    if (count <= 1) {
      this.gateXs.push((this.GATE_X_LEFT + this.GATE_X_RIGHT) / 2);
    } else {
      const step = (this.GATE_X_RIGHT - this.GATE_X_LEFT) / (count - 1);
      for (let i = 0; i < count; i++) this.gateXs.push(this.GATE_X_LEFT + i * step);
    }

    // Redraw gate boxes + labels into gateBoxLayer.
    this.gateBoxLayer.removeAll(true);
    this.gateXs.forEach((gx, i) => {
      const box = this.add.rectangle(gx, this.apronY + 18, 56, 26, 0x1f2e42)
        .setStrokeStyle(1, 0x4a6a8c, 0.8);
      const label = this.add.text(gx, this.apronY + 18, `G${i + 1}`, {
        fontFamily: 'Segoe UI', fontSize: '11px', color: '#7a8aa0',
      }).setOrigin(0.5);
      this.gateBoxLayer.add(box);
      this.gateBoxLayer.add(label);
    });

    // Existing parked planes need re-layout — their cached gate x-pixel
    // positions may have shifted with the new spacing.
    this.parkedSig = '';
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

    type Tag = { label: string; color: string };
    const tags: Tag[] = [];
    for (const plane of me.planes) {
      const s = plane.status;
      if (s.kind === 'flying' || s.kind === 'cargo' || s.kind === 'ferry') {
        if (s.from === hub) tags.push({ label: `→ ${getCity(s.to).name}`, color: '#ffc857' });
        else if (s.to === hub) tags.push({ label: `← ${getCity(s.from).name}`, color: '#7be08a' });
      } else if (s.kind === 'maintenance' && s.airportId === hub) {
        // Sabotage / mishap parked the plane in the shop — surface it so
        // the player understands why an expected dispatch isn't happening.
        tags.push({ label: `🔧 ${plane.name}`, color: '#ff9aa6' });
      }
    }

    const sig = tags.map(t => `${t.color}|${t.label}`).join('||');
    if (sig === this.transitSig) return;
    this.transitSig = sig;

    this.transitLayer.removeAll(true);
    if (tags.length === 0) return;

    const stripY = this.apronY + 45;
    const header = this.add.text(80, stripY, 'IN TRANSIT', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '10px',
      color: '#9bb0c4',
      fontStyle: 'bold',
    });
    this.transitLayer.add(header);

    let x = 170;
    for (const t of tags) {
      const tag = this.add.text(x, stripY, t.label, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
        color: t.color,
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

    // Apron tarmac — lighter so it pops against the floor. Gate stall boxes
    // are drawn separately on gateBoxLayer by ensureGateLayout() so they can
    // be redrawn when the active hub or its gate count changes.
    this.add.rectangle(cx, this.apronY, right - left + 40, 64, 0x2c3e54).setStrokeStyle(1, 0x4a6a8c);

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

  /** Scale an animation duration (in real-time ms) by the current game
   *  speed. The same anim takes 2800 ms at 1×, 1400 ms at 2×, 700 ms at 4×.
   *  This keeps the landing animation strictly shorter than the in-game
   *  turnaround cooldown at every speed (14 game-min < 15 game-min), so
   *  the plane is never in two visual states at once on a short route. */
  private a(ms: number): number {
    return Math.round(ms / GameState.get().speed);
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

    // Release gates held by planes that are no longer here (took off, were
    // sold, switched hubs, etc.) AND aren't currently mid-animation. Keeping
    // a gate reserved while the plane is animating means the landing icon
    // taxis to the same gate the parked icon will appear at — and a plane
    // that just deplaned doesn't visually hop to an earlier vacated gate
    // when its boarding sequence starts.
    const idleIds = new Set(idle.map(p => p.id));
    for (const planeId of [...this.gateByPlaneId.keys()]) {
      if (!idleIds.has(planeId) && !this.animatingIds.has(planeId)) {
        this.gateByPlaneId.delete(planeId);
      }
    }
    // Lazily assign a stable gate to any newly-parked plane.
    for (const plane of idle) this.gateIndexFor(plane);

    const tuples: Array<{ plane: Plane; gateIdx: number }> =
      idle.map(p => ({ plane: p, gateIdx: this.gateByPlaneId.get(p.id)! }));
    const sig = tuples.map(t => `${t.plane.id}@${t.gateIdx}`).join('|');
    if (sig === this.parkedSig) return;

    this.parkedSig = sig;
    this.parkedLayer.removeAll(true);
    for (const { plane, gateIdx } of tuples) {
      const x = this.gateXs[gateIdx];
      const icon = this.makePlaneIcon(x, this.apronY, plane.model.seats, me.color, 0);
      this.parkedLayer.add(icon);
      // Short tail-number label above the plane. Plane.id is sequential ("p1",
      // "p2", …) and globally unique, so it doubles as a stable per-plane
      // tag — easier to track which plane is which when the fleet grows past
      // a handful. Placed at apronY - 14 to clear the BOARDING bar that
      // sits at apronY - 24 during a takeoff.
      const idLabel = this.add.text(x, this.apronY - 14, plane.id.toUpperCase(), {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '9px',
        color: '#a0b0c4',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.parkedLayer.add(idLabel);
    }
  }

  // ----- Day / night cycle -----

  /** Build the static runway edge-light dots once. Their visibility is
   *  controlled by `runwayLightsLayer.alpha` in updateDaylight(). */
  private buildRunwayLights() {
    const count = 14;
    const left = this.RUNWAY_LEFT + 50;
    const right = this.RUNWAY_RIGHT - 50;
    const step = (right - left) / (count - 1);
    for (let i = 0; i < count; i++) {
      const x = left + i * step;
      // Top + bottom edge of the runway. Soft yellow with a fainter halo
      // outer dot to suggest a glow without needing a shader.
      const halo1 = this.add.circle(x, this.runwayY - 17, 4, 0xffd44a, 0.20);
      const dot1  = this.add.circle(x, this.runwayY - 17, 1.8, 0xffe07a, 1);
      const halo2 = this.add.circle(x, this.runwayY + 17, 4, 0xffd44a, 0.20);
      const dot2  = this.add.circle(x, this.runwayY + 17, 1.8, 0xffe07a, 1);
      this.runwayLightsLayer.add([halo1, dot1, halo2, dot2]);
    }
    this.runwayLightsLayer.setAlpha(0);
  }

  /** Update sky-tint + runway-light opacity based on the in-game hour.
   *  Smoothly interpolates between keyframes so the transition between
   *  phases is gradual as the game clock advances. */
  private updateDaylight() {
    const d = GameState.get().date;
    const t = d.hour + d.minute / 60;
    const phase = daylightAt(t);
    this.skyOverlay.setFillStyle(phase.color, phase.alpha);
    this.runwayLightsLayer.setAlpha(phase.lightsAlpha);
  }

  // ----- Visiting rival planes -----

  /**
   * Render every rival plane that's currently idle AT YOUR active hub in a
   * thin "visitor row" above the gate boxes — in their airline color, with
   * a small name label below the icon, scaled down so it reads as "not
   * one of yours." Caps at MAX_VISITORS so a dogpile (rival hub right
   * next to yours) doesn't overflow horizontally; surplus visitors just
   * aren't drawn this tick.
   *
   * Sig-cached so the layer only rebuilds when the visiting set changes.
   */
  private drawVisitingPlanes() {
    const state = GameState.get();
    const hub = state.activeHub;
    type V = { plane: Plane; owner: Player };
    const visitors: V[] = [];
    for (const player of state.players) {
      if (!player.isAI) continue;
      for (const plane of player.planes) {
        if (this.animatingRivalIds.has(plane.id)) continue;
        if (plane.status.kind !== 'idle') continue;
        if (plane.status.airportId !== hub) continue;
        // Filter: this plane's assigned route must actually touch our hub.
        // Without this, a plane that's parked at our hub due to a stale
        // routeId would still render — confusing.
        const route = plane.routeId
          ? player.routes.find(r => r.id === plane.routeId)
          : null;
        if (!route || (route.fromCity !== hub && route.toCity !== hub)) continue;
        visitors.push({ plane, owner: player });
      }
    }

    const shown = visitors.slice(0, this.MAX_VISITORS);
    const slotStep = shown.length <= 1
      ? 0
      : (this.VISITOR_X_RIGHT - this.VISITOR_X_LEFT) / (shown.length - 1);
    const positions = shown.map((v, i) => ({
      ...v,
      x: shown.length === 1
        ? (this.VISITOR_X_LEFT + this.VISITOR_X_RIGHT) / 2
        : this.VISITOR_X_LEFT + i * slotStep,
    }));

    const sig = positions
      .map(p => `${p.plane.id}@${p.x.toFixed(0)}|${p.owner.color}`)
      .join('|');
    if (sig === this.visitorSig) return;
    this.visitorSig = sig;

    this.visitorLayer.removeAll(true);
    for (const p of positions) {
      const icon = this.makePlaneIcon(
        p.x, this.VISITOR_Y, p.plane.model.seats, p.owner.color, 0,
      );
      icon.setScale(0.7);
      this.visitorLayer.add(icon);
      const label = this.add.text(p.x, this.VISITOR_Y + 14, p.owner.name, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '9px',
        color: '#a0b0c4',
      }).setOrigin(0.5, 0);
      this.visitorLayer.add(label);
    }
  }

  /** Poll all rival players' planes for status transitions that affect the
   *  active hub. Mirrors checkStatusChanges() but routes the animation
   *  through the visitor-row endpoints instead of your gates, and uses
   *  the owning AI's airline color. */
  private checkRivalStatusChanges() {
    const state = GameState.get();
    const hub = state.activeHub;
    for (const player of state.players) {
      if (!player.isAI) continue;
      for (const plane of player.planes) {
        const cur = plane.status.kind;
        const prev = this.rivalStatuses[plane.id];
        if (prev === undefined) {
          this.rivalStatuses[plane.id] = cur;
          continue;
        }
        if (prev === 'idle' && (cur === 'flying' || cur === 'cargo' || cur === 'ferry')) {
          if ((plane.status.kind === 'flying' || plane.status.kind === 'cargo' || plane.status.kind === 'ferry')
              && plane.status.from === hub) {
            this.animateVisitorTakeoff(plane, player);
          }
        } else if ((prev === 'flying' || prev === 'cargo' || prev === 'ferry') && cur === 'idle') {
          if (plane.status.kind === 'idle' && plane.status.airportId === hub) {
            this.animateVisitorLanding(plane, player);
          }
        }
        this.rivalStatuses[plane.id] = cur;
      }
    }
  }

  /** Rival plane departure from your hub. Taxis from a visitor slot to the
   *  nearer runway end and exits. No BOARDING bar / no tarmac passengers —
   *  that flavor is reserved for your own apron. */
  private animateVisitorTakeoff(plane: Plane, owner: Player) {
    // Pick a horizontal slot at the time of takeoff so the icon spawns near
    // where the player saw it parked. Hash the plane id to a slot index for
    // stability across this animation; if drawVisitingPlanes happens to put
    // it at a different x next tick, the takeoff still reads cleanly.
    const slotIdx = this.hashSlot(plane.id);
    const startX = this.visitorSlotX(slotIdx);
    // Exit toward whichever runway end is closer to keep the path natural.
    const cx = (this.RUNWAY_LEFT + this.RUNWAY_RIGHT) / 2;
    const exitsRight = startX >= cx;
    const startRot = exitsRight ? 0 : Math.PI;
    const thresholdX = exitsRight ? this.RUNWAY_LEFT + 50 : this.RUNWAY_RIGHT - 50;
    const exitX = exitsRight ? GAME_WIDTH + 80 : -80;

    this.animatingRivalIds.add(plane.id);
    this.visitorSig = '';   // force visitor-row re-render now that this one's leaving

    const icon = this.makePlaneIcon(startX, this.VISITOR_Y, plane.model.seats, owner.color, startRot);
    icon.setScale(0.9);
    this.flightLayer.add(icon);

    this.tweens.add({
      targets: icon,
      x: thresholdX,
      y: this.runwayY,
      duration: this.a(1100),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.tweens.add({
          targets: icon,
          x: exitX,
          duration: this.a(1200),
          ease: 'Cubic.easeIn',
          onComplete: () => {
            icon.destroy();
            this.animatingRivalIds.delete(plane.id);
            this.visitorSig = '';
          },
        });
      },
    });
  }

  /** Rival plane arrival to your hub. Enters from a runway end, decelerates
   *  to the threshold, then taxis up to a visitor slot. */
  private animateVisitorLanding(plane: Plane, owner: Player) {
    const slotIdx = this.hashSlot(plane.id);
    const endX = this.visitorSlotX(slotIdx);
    const cx = (this.RUNWAY_LEFT + this.RUNWAY_RIGHT) / 2;
    const entersFromRight = endX >= cx;
    const startX = entersFromRight ? GAME_WIDTH + 80 : -80;
    const flightRot = entersFromRight ? Math.PI : 0;
    const thresholdX = entersFromRight ? this.RUNWAY_LEFT + 50 : this.RUNWAY_RIGHT - 50;

    this.animatingRivalIds.add(plane.id);
    this.visitorSig = '';

    const icon = this.makePlaneIcon(startX, this.runwayY, plane.model.seats, owner.color, flightRot);
    icon.setScale(0.9);
    this.flightLayer.add(icon);

    this.tweens.add({
      targets: icon,
      x: thresholdX,
      duration: this.a(1200),
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: icon,
          x: endX,
          y: this.VISITOR_Y,
          rotation: 0,
          duration: this.a(1000),
          ease: 'Sine.easeInOut',
          onComplete: () => {
            icon.destroy();
            this.animatingRivalIds.delete(plane.id);
            this.visitorSig = '';
          },
        });
      },
    });
  }

  /** Stable slot index from a plane id. Deterministic so a takeoff exits
   *  from the same x the landing parked at, even though we don't track an
   *  explicit slot map. */
  private hashSlot(planeId: string): number {
    let h = 0;
    for (let i = 0; i < planeId.length; i++) h = (h * 31 + planeId.charCodeAt(i)) | 0;
    return Math.abs(h) % this.MAX_VISITORS;
  }

  private visitorSlotX(slotIdx: number): number {
    if (this.MAX_VISITORS <= 1) {
      return (this.VISITOR_X_LEFT + this.VISITOR_X_RIGHT) / 2;
    }
    const step = (this.VISITOR_X_RIGHT - this.VISITOR_X_LEFT) / (this.MAX_VISITORS - 1);
    return this.VISITOR_X_LEFT + slotIdx * step;
  }

  // ----- Animations -----

  /** Stable gate index for a plane. Persists across the plane's lifecycle at
   *  this hub — assigned lazily on first request (landing or initial park),
   *  remembered through the takeoff animation, and released only when the
   *  plane is no longer at the apron AND no longer animating
   *  (see drawParkedPlanes). Picks the lowest unoccupied gate; only wraps
   *  when more planes than gates are parked. */
  private gateIndexFor(plane: Plane): number {
    const recorded = this.gateByPlaneId.get(plane.id);
    if (recorded !== undefined) return recorded;
    const occupied = new Set(this.gateByPlaneId.values());
    for (let g = 0; g < this.gateXs.length; g++) {
      if (!occupied.has(g)) {
        this.gateByPlaneId.set(plane.id, g);
        return g;
      }
    }
    // All gates taken — fall back to a stable plane-index wrap so the same
    // plane keeps the same wrapped gate slot.
    const i = GameState.get().human.planes.indexOf(plane);
    const g = Math.max(0, i) % this.gateXs.length;
    this.gateByPlaneId.set(plane.id, g);
    return g;
  }

  private animateTakeoff(plane: Plane) {
    const me = GameState.get().human;
    const seats = plane.model.seats;
    const gateIdx = this.gateIndexFor(plane);
    const gateX = this.gateXs[gateIdx];
    // Alternate runway end so neighboring gates don't trace the same path
    // when two planes take off near-simultaneously.
    const exitsRight = (gateIdx % 2) === 0;
    const startRot = exitsRight ? 0 : Math.PI;
    const thresholdX = exitsRight ? this.RUNWAY_LEFT + 50 : this.RUNWAY_RIGHT - 50;
    const exitX = exitsRight ? GAME_WIDTH + 80 : -80;

    // Reserve the gate immediately (keeps gateByPlaneId from cleaning it
    // up during the hold) but do NOT create the visible icon yet. At 2×/4×
    // speeds the turnaround cooldown expires while this plane's own
    // landing animation is still mid-taxi — creating the takeoff icon
    // now would draw a second sprite at the same gate the landing icon
    // is taxiing toward, and the player sees them "merge" into one plane.
    this.animatingIds.add(plane.id);

    const startTakeoff = () => {
      // State may have moved on while we held — at 4× speed the plane
      // might already have completed another full cycle. Skip the anim
      // entirely if so; the dispatch / land plumbing keeps the game
      // state consistent regardless.
      if (plane.status.kind !== 'flying'
          || plane.status.from !== GameState.get().activeHub) {
        this.animatingIds.delete(plane.id);
        return;
      }

      const icon = this.makePlaneIcon(gateX, this.apronY, seats, me.color, startRot);
      icon.setScale(1.3); // bigger during animation for visibility
      this.flightLayer.add(icon);

      // Phase 0: BOARDING. Plane sits at gate while a small bar above it fills,
      // selling the "passengers loading" beat before taxi starts. Durations
      // scale with game speed (see this.a) so the full takeoff cycle always
      // fits inside the in-game turnaround window.
      const boarding = this.boardingProgress(gateX, this.apronY - 24, '#ffc857', 'BOARDING');
      this.spawnPassengers(gateX, 'boarding', this.a(800));
      this.tweens.add({
        targets: boarding.fill,
        scaleX: 1,
        duration: this.a(800),
        ease: 'Linear',
        onComplete: () => {
          boarding.destroy();
          this.flashLabel(gateX, this.apronY - 36, 'TAKEOFF', '#ffc857');

          // Phase 1: taxi from gate to the runway threshold.
          this.tweens.add({
            targets: icon,
            x: thresholdX,
            y: this.runwayY,
            duration: this.a(1000),
            ease: 'Sine.easeInOut',
            onComplete: () => {
              // Phase 2: accelerate down the runway and exit.
              this.tweens.add({
                targets: icon,
                x: exitX,
                duration: this.a(1200),
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
    };

    // If THIS plane is still mid-landing, chain off its onComplete so the
    // takeoff icon is created in the same callback that destroys the
    // landing icon — eliminates any frame gap (which appeared on G1 at
    // 2×/4× speeds because the turnaround cooldown is shorter than the
    // 2.8s landing animation, so a delayedCall race could leave the
    // gate empty for a frame between the two animations).
    if (this.activeLandingEndsAt.has(plane.id)) {
      this.onLandingComplete.set(plane.id, startTakeoff);
      return;
    }

    // Other planes' landings still get a time-based hold (we don't have
    // their onComplete to chain off without more wiring; the race they'd
    // cause is just a visual one-off, not a same-gate merge).
    const now = this.time.now;
    let holdMs = 0;
    for (const endsAt of this.activeLandingEndsAt.values()) {
      holdMs = Math.max(holdMs, endsAt - now);
    }
    holdMs = Math.max(0, Math.min(holdMs, this.TAKEOFF_HOLD_CAP_MS));
    if (holdMs > 0) {
      this.time.delayedCall(holdMs, startTakeoff);
    } else {
      // No hold needed — run synchronously so the takeoff icon spawns in
      // the same frame the parked icon is removed by drawParkedPlanes.
      startTakeoff();
    }
  }

  private animateLanding(plane: Plane) {
    const me = GameState.get().human;
    const seats = plane.model.seats;
    const gateIdx = this.gateIndexFor(plane);
    const gateX = this.gateXs[gateIdx];
    // Match takeoff convention so each plane uses a consistent runway end.
    const entersFromRight = (gateIdx % 2) === 0;

    this.animatingIds.add(plane.id);
    // Publish the expected end-of-landing time so any pending takeoff
    // animations can hold their BOARDING phase until we're parked.
    // Total 2800 ms (1200 + 1000 + 600), scaled by game speed so the
    // animation ends before the 15 game-min turnaround does, regardless
    // of speed (preserves the no-overlap invariant on short routes).
    this.activeLandingEndsAt.set(plane.id, this.time.now + this.a(2800));
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
      duration: this.a(1200),
      ease: 'Cubic.easeOut',
      onComplete: () => {
        // Phase 2: taxi to a gate and rotate to parked orientation.
        this.tweens.add({
          targets: icon,
          x: gateX,
          y: this.apronY,
          rotation: 0,
          duration: this.a(1000),
          ease: 'Sine.easeInOut',
          onComplete: () => {
            // Phase 3: DEPLANING. A short bar empties above the parked plane
            // before it disappears back into the parked-layer pool — sells the
            // "passengers off, plane resets" beat.
            const deplane = this.boardingProgress(gateX, this.apronY - 24, '#7be08a', 'ARRIVED');
            this.spawnPassengers(gateX, 'arrived', this.a(600));
            // Bar starts full and drains.
            deplane.fill.scaleX = 1;
            this.tweens.add({
              targets: deplane.fill,
              scaleX: 0,
              duration: this.a(600),
              ease: 'Linear',
              onComplete: () => {
                deplane.destroy();
                icon.destroy();
                this.animatingIds.delete(plane.id);
                this.activeLandingEndsAt.delete(plane.id);
                // Fire any takeoff that was chained off this landing's
                // completion. Doing it here (same callback) means the new
                // icon spawns before any drawParkedPlanes pass can run,
                // so the gate doesn't visibly empty between phases.
                const pending = this.onLandingComplete.get(plane.id);
                if (pending) {
                  this.onLandingComplete.delete(plane.id);
                  pending();
                }
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

  /**
   * Stream of small stick-figure passengers walking gate ↔ plane during the
   * BOARDING (yellow, gate → plane) and ARRIVED (green, plane → gate) phases.
   * Single-file vertical track at the gate column, 5 figures staggered across
   * the supplied totalDurMs so several are in transit at once but no two
   * overlap. totalDurMs is the already-game-speed-scaled duration of the
   * phase so the stream finishes when the boarding/deplane bar finishes.
   */
  private spawnPassengers(
    gateX: number,
    phase: 'boarding' | 'arrived',
    totalDurMs: number,
  ): void {
    const planeY = this.apronY - 2;
    const gateY = this.apronY + 22;
    const count = 5;
    // Each figure walks for ~half the phase so multiple are in flight at once.
    // Floor at the scaled minimum so even at 4× speed they're not instantaneous.
    const eachDur = Math.max(this.a(300), Math.floor(totalDurMs * 0.5));
    const stagger = Math.max(1, Math.floor((totalDurMs - eachDur) / (count - 1)));
    const color = phase === 'boarding' ? 0xffc857 : 0x7be08a;

    for (let i = 0; i < count; i++) {
      const delay = i * stagger;
      this.time.delayedCall(delay, () => {
        const startY = phase === 'boarding' ? gateY : planeY;
        const endY = phase === 'boarding' ? planeY : gateY;
        const fig = this.makeStickFigure(gateX, startY, color);
        this.flightLayer.add(fig);
        this.tweens.add({
          targets: fig,
          y: endY,
          duration: eachDur,
          ease: 'Linear',
          onComplete: () => fig.destroy(),
        });
      });
    }
  }

  /** Tiny stick figure — head + body line. Sized to fit between a parked
   *  plane (apronY) and the gate box (apronY + 18) without overlapping either. */
  private makeStickFigure(x: number, y: number, color: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x, y });
    g.fillStyle(color, 1);
    g.fillCircle(0, -1.6, 1.3);
    g.lineStyle(1.2, color, 1);
    g.beginPath();
    g.moveTo(0, -0.2);
    g.lineTo(0, 2.6);
    g.strokePath();
    return g;
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
      duration: this.a(1800),
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

/**
 * Sky-tint keyframes by game-clock hour. Each entry: [hour, color, alpha,
 * runway-lights alpha]. `daylightAt(t)` finds the bracketing pair and
 * linearly interpolates color + alphas, so transitions between phases are
 * smooth as the in-game clock advances minute-by-minute.
 *
 * - 00:00 deep night (cool blue tint), runway lights at full
 * - 05:00 still dark, lights still on
 * - 06:30 dawn — warm amber tint at strongest
 * - 09:00 morning sun fades the tint to near-zero
 * - 12:00–16:00 midday, no overlay
 * - 18:00 dusk amber tint
 * - 20:00 evening blue, lights coming up
 * - 22:00–24:00 back to deep night
 */
type DaylightFrame = [hour: number, color: number, alpha: number, lightsAlpha: number];
const DAYLIGHT_KEYFRAMES: DaylightFrame[] = [
  [0,  0x0a1a2c, 0.34, 1.00],
  [5,  0x0a1a2c, 0.30, 0.95],
  [6,  0xff7a3a, 0.22, 0.75],
  [7,  0xff8c4a, 0.16, 0.45],
  [9,  0xffd47a, 0.05, 0.00],
  [12, 0x000000, 0.00, 0.00],
  [16, 0x000000, 0.00, 0.00],
  [18, 0xff7a3a, 0.18, 0.30],
  [19, 0xc25030, 0.22, 0.60],
  [20, 0x1a2840, 0.28, 0.85],
  [22, 0x0a1a2c, 0.34, 1.00],
  [24, 0x0a1a2c, 0.34, 1.00],
];

function daylightAt(t: number): { color: number; alpha: number; lightsAlpha: number } {
  let i = 0;
  while (i < DAYLIGHT_KEYFRAMES.length - 1 && DAYLIGHT_KEYFRAMES[i + 1][0] <= t) i++;
  const a = DAYLIGHT_KEYFRAMES[i];
  const b = DAYLIGHT_KEYFRAMES[Math.min(i + 1, DAYLIGHT_KEYFRAMES.length - 1)];
  const dur = b[0] - a[0];
  const fr = dur > 0 ? (t - a[0]) / dur : 0;
  return {
    color: lerpColor(a[1], b[1], fr),
    alpha: a[2] + (b[2] - a[2]) * fr,
    lightsAlpha: a[3] + (b[3] - a[3]) * fr,
  };
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8)  |
     Math.round(b1 + (b2 - b1) * t)
  );
}
