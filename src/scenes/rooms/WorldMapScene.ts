import Phaser from 'phaser';
import { GameState } from '../../state/GameState';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../../config';
import { CITIES, CityData, getCity, getPlaneModel } from '../../state/catalog';
import { CONTINENTS, ISLANDS } from '../../state/worldMapData';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { sound } from '../../systems/Sound';
import { hubCost } from '../../state/Player';

/**
 * 2D world map. Equirectangular projection (lon→x, lat→y) with mouse-wheel
 * zoom-at-cursor and click-drag pan. Routes are straight lines; planes are
 * drawn as airplane-shaped icons sized by aircraft seats and rotated by
 * heading. Per-airline filter chips toggle visibility for routes + planes.
 */
export class WorldMapScene extends Phaser.Scene {
  private mapRect = { x: 80, y: 130, w: GAME_WIDTH - 160, h: GAME_HEIGHT - 230 };

  private view = { centerLon: 0, centerLat: 0, zoom: 1 };
  private readonly MIN_ZOOM = 1;
  private readonly MAX_ZOOM = 60;

  private mapContainer!: Phaser.GameObjects.Container;
  private routesLayer!: Phaser.GameObjects.Graphics;
  private planesLayer!: Phaser.GameObjects.Container;

  private dragging = false;
  private dragMoved = false;
  private dragStart = { x: 0, y: 0, centerLon: 0, centerLat: 0 };

  private zoomLabel!: Phaser.GameObjects.Text;

  /** Per-airline visibility filter. true = visible. Defaults to all true. */
  private visible: Record<string, boolean> = {};
  private filterChips: { id: string; rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];

  /** City the player has clicked to inspect (for the buy/set-hub panel). */
  private selectedCityId: string | null = null;
  private cityPanel: Phaser.GameObjects.Container | null = null;
  /** City currently under the cursor — drives the route hover-highlight in
   *  drawRoutes. Null = no highlight, render all routes at default style. */
  private hoveredCityId: string | null = null;

  constructor() { super('WorldMapScene'); }

  create() {
    // Initialize filter visibility from current players (all on by default).
    for (const p of GameState.get().players) this.visible[p.id] = true;

    // Switch to the airier Control Tower theme while the map is open.
    sound.startMusic('world-map');

    // Dim background.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();

    // Map panel.
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 60, GAME_HEIGHT - 60, COLORS.panel)
      .setStrokeStyle(2, COLORS.panelBorder);

    this.add
      .text(GAME_WIDTH / 2, 50, 'World Map — Live Operations', {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '24px',
        color: COLORS.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    new Button({
      scene: this,
      x: GAME_WIDTH - 90,
      y: 50,
      width: 100,
      height: 32,
      label: 'Close',
      onClick: () => this.close(),
    });

    new Button({
      scene: this,
      x: 130,
      y: 50,
      width: 100,
      height: 28,
      label: 'Reset view',
      onClick: () => this.resetView(),
    });

    this.zoomLabel = this.add.text(190, 50, '', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '12px',
      color: COLORS.textDim,
    }).setOrigin(0, 0.5);

    // Filter row directly above the map.
    this.buildFilterChips();

    // Ocean plate.
    const m = this.mapRect;
    const ocean = this.add
      .rectangle(m.x + m.w / 2, m.y + m.h / 2, m.w, m.h, 0x0a2540)
      .setStrokeStyle(1, 0x335577);

    ocean.setInteractive({ useHandCursor: false });
    ocean.on('wheel', (pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
      this.zoomAt(pointer.x, pointer.y, dy < 0 ? 1.2 : 1 / 1.2);
    });
    ocean.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragMoved = false;
      this.dragStart = {
        x: pointer.x, y: pointer.y,
        centerLon: this.view.centerLon, centerLat: this.view.centerLat,
      };
    });

    // Mask map contents to the ocean rect.
    this.mapContainer = this.add.container(0, 0);
    this.routesLayer = this.add.graphics();
    this.planesLayer = this.add.container(0, 0);

    const maskShape = this.add.graphics().setVisible(false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(m.x, m.y, m.w, m.h);
    const mask = maskShape.createGeometryMask();
    this.mapContainer.setMask(mask);
    this.routesLayer.setMask(mask);
    this.planesLayer.setMask(mask);

    this.renderStaticMap();

    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.input.keyboard?.on('keydown-ZERO', () => this.resetView());

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const dxPx = pointer.x - this.dragStart.x;
      const dyPx = pointer.y - this.dragStart.y;
      if (Math.abs(dxPx) + Math.abs(dyPx) > 3) this.dragMoved = true;
      const dLon = (dxPx / this.mapRect.w) * (360 / this.view.zoom);
      const dLat = (dyPx / this.mapRect.h) * (180 / this.view.zoom);
      this.view.centerLon = this.dragStart.centerLon - dLon;
      this.view.centerLat = this.dragStart.centerLat + dLat;
      this.clampCenter();
      this.renderStaticMap();
    });
    this.input.on('pointerup', () => {
      // Click on empty ocean (no drag, no city hit) dismisses the city panel.
      // We check before clearing `dragging` because dragging being true at
      // pointerup means pointerdown landed on the ocean — i.e., not on a city.
      if (this.dragging && !this.dragMoved && this.selectedCityId) {
        this.selectedCityId = null;
        this.refreshCityPanel();
      }
      this.dragging = false;
    });
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objs: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
        if (!this.isOverMap(pointer)) return;
        this.zoomAt(pointer.x, pointer.y, dy < 0 ? 1.2 : 1 / 1.2);
      }
    );

    this.updateZoomLabel();
  }

  // ----- Filter chips -----
  private buildFilterChips() {
    const state = GameState.get();
    const startX = 90;
    const y = 95;
    let x = startX;
    this.add.text(x, y, 'Show:', {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '12px',
      color: COLORS.textDim,
    }).setOrigin(0, 0.5);
    x += 50;
    for (const p of state.players) {
      const w = 140;
      const h = 24;
      const rect = this.add.rectangle(x + w / 2, y, w, h, 0x14304a).setStrokeStyle(2, p.color);
      const label = this.add.text(x + w / 2, y, `${p.name}${state.takenOverBy[p.id] ? ' (out)' : ''}`, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '12px',
        color: '#e8eef5',
      }).setOrigin(0.5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => {
        this.visible[p.id] = !this.visible[p.id];
        this.refreshChip(p.id);
      });
      this.filterChips.push({ id: p.id, rect, label });
      this.refreshChip(p.id);
      x += w + 8;
    }
  }

  private refreshChip(id: string) {
    const chip = this.filterChips.find(c => c.id === id);
    if (!chip) return;
    const on = this.visible[id];
    chip.rect.setFillStyle(on ? 0x14304a : 0x0b1a2c);
    chip.label.setAlpha(on ? 1 : 0.4);
  }

  // ----- View / projection -----
  private close() {
    // Return to the lobby theme as we close the map.
    sound.startMusic('airport-lobby');
    this.scene.stop();
    this.scene.resume('AirportScene');
  }

  private resetView() {
    this.view = { centerLon: 0, centerLat: 0, zoom: 1 };
    this.renderStaticMap();
    this.updateZoomLabel();
  }

  update() {
    this.drawRoutes();
    this.drawPlanes();
  }

  private isOverMap(p: Phaser.Input.Pointer): boolean {
    const m = this.mapRect;
    return p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h;
  }

  private zoomAt(px: number, py: number, factor: number) {
    if (!this.isOverMap({ x: px, y: py } as Phaser.Input.Pointer)) return;
    const { lon, lat } = this.pixelToLonLat(px, py);
    const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.view.zoom * factor));
    if (newZoom === this.view.zoom) return;
    this.view.zoom = newZoom;
    const m = this.mapRect;
    this.view.centerLon = lon - ((px - (m.x + m.w / 2)) / m.w) * (360 / newZoom);
    this.view.centerLat = lat + ((py - (m.y + m.h / 2)) / m.h) * (180 / newZoom);
    this.clampCenter();
    this.renderStaticMap();
    this.updateZoomLabel();
  }

  private clampCenter() {
    const lonRange = 360 / this.view.zoom;
    const latRange = 180 / this.view.zoom;
    const lonMin = -180 + lonRange / 2;
    const lonMax =  180 - lonRange / 2;
    const latMin =  -90 + latRange / 2;
    const latMax =   90 - latRange / 2;
    if (lonMax > lonMin) this.view.centerLon = Math.max(lonMin, Math.min(lonMax, this.view.centerLon));
    if (latMax > latMin) this.view.centerLat = Math.max(latMin, Math.min(latMax, this.view.centerLat));
  }

  private updateZoomLabel() {
    this.zoomLabel.setText(`Zoom ${this.view.zoom.toFixed(1)}×   (scroll to zoom, drag to pan, 0 to reset)`);
  }

  private lonToX(lon: number): number {
    const m = this.mapRect;
    return m.x + m.w / 2 + ((lon - this.view.centerLon) / (360 / this.view.zoom)) * m.w;
  }

  private latToY(lat: number): number {
    const m = this.mapRect;
    return m.y + m.h / 2 - ((lat - this.view.centerLat) / (180 / this.view.zoom)) * m.h;
  }

  private pixelToLonLat(px: number, py: number): { lon: number; lat: number } {
    const m = this.mapRect;
    const lon = this.view.centerLon + ((px - (m.x + m.w / 2)) / m.w) * (360 / this.view.zoom);
    const lat = this.view.centerLat - ((py - (m.y + m.h / 2)) / m.h) * (180 / this.view.zoom);
    return { lon, lat };
  }

  private cityXY(c: CityData): { x: number; y: number } {
    return { x: this.lonToX(c.lon), y: this.latToY(c.lat) };
  }

  // ----- Static map (continents, islands, grid, cities) -----
  private renderStaticMap() {
    this.mapContainer.removeAll(true);
    this.drawContinents();
    this.drawIslands();
    this.drawGrid();
    this.drawCities();
  }

  private drawContinents() {
    const g = this.add.graphics();
    g.fillStyle(0x2d4a3a, 1);
    g.lineStyle(1, 0x4a7a5e, 0.8);
    for (const c of CONTINENTS) {
      const pts = c.points.map(([lon, lat]) => ({ x: this.lonToX(lon), y: this.latToY(lat) }));
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
    this.mapContainer.add(g);
  }

  private drawIslands() {
    const g = this.add.graphics();
    g.fillStyle(0x2d4a3a, 1);
    g.lineStyle(1, 0x4a7a5e, 0.8);
    // Convert degrees-radius to projection pixels using current latitude scaling.
    for (const isl of ISLANDS) {
      const x = this.lonToX(isl.lon);
      const y = this.latToY(isl.lat);
      // Radius in pixels is roughly radius_deg * (mapH / latRange).
      const m = this.mapRect;
      const rPx = isl.radius * (m.h / (180 / this.view.zoom));
      const r = Math.max(1.5, rPx);
      g.fillCircle(x, y, r);
      g.strokeCircle(x, y, r);
    }
    this.mapContainer.add(g);
  }

  private drawGrid() {
    const m = this.mapRect;
    const g = this.add.graphics();
    g.lineStyle(1, 0x1f4060, 0.35);
    const step = this.gridStep();
    for (let lat = -80; lat <= 80; lat += step) {
      const y = this.latToY(lat);
      if (y < m.y || y > m.y + m.h) continue;
      g.lineBetween(m.x, y, m.x + m.w, y);
    }
    for (let lon = -180; lon <= 180; lon += step) {
      const x = this.lonToX(lon);
      if (x < m.x || x > m.x + m.w) continue;
      g.lineBetween(x, m.y, x, m.y + m.h);
    }
    g.lineStyle(1, 0x335577, 0.5);
    const eqY = this.latToY(0);
    if (eqY >= m.y && eqY <= m.y + m.h) g.lineBetween(m.x, eqY, m.x + m.w, eqY);
    this.mapContainer.add(g);
  }

  private gridStep(): number {
    const z = this.view.zoom;
    if (z < 1.5) return 30;
    if (z < 4)   return 10;
    if (z < 12)  return 5;
    if (z < 30)  return 2;
    return 1;
  }

  private drawCities() {
    const m = this.mapRect;
    const me = GameState.get().human;
    for (const city of CITIES) {
      const x = this.lonToX(city.lon);
      const y = this.latToY(city.lat);
      if (x < m.x - 10 || x > m.x + m.w + 10 || y < m.y - 10 || y > m.y + m.h + 10) continue;
      // Major-city dots are slightly bigger; hubs the player owns get a thicker
      // ring + the player's color so they pop against the rest.
      const r = city.demand >= 1.3 ? 4.5 : 3;
      const isOwnHub = me.hubs.includes(city.id);
      const fill = isOwnHub ? me.color : 0xffc857;
      const stroke = isOwnHub ? 0xffffff : 0xffffff;
      const strokeW = isOwnHub ? 2 : 1;
      const dot = this.add.circle(x, y, isOwnHub ? r + 1.5 : r, fill).setStrokeStyle(strokeW, stroke);
      const label = this.add.text(x + r + 4, y - 6, city.name, {
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '10px',
        color: isOwnHub ? '#ffffff' : '#cbd6e3',
        fontStyle: isOwnHub ? 'bold' : 'normal',
      });
      // Click to inspect / buy as hub. Hit area is the circle.
      dot.setInteractive({ useHandCursor: true });
      dot.on('pointerdown', () => {
        if (this.dragMoved) return;          // ignore clicks that came from a pan
        this.selectedCityId = city.id;
        this.refreshCityPanel();
      });
      dot.on('pointerover', () => { this.hoveredCityId = city.id; });
      dot.on('pointerout',  () => {
        if (this.hoveredCityId === city.id) this.hoveredCityId = null;
      });
      this.mapContainer.add(dot);
      this.mapContainer.add(label);
    }
  }

  /** Floating bottom-center panel showing the clicked city, with a Buy-hub
   *  button when the player doesn't already own it as a hub. */
  private refreshCityPanel() {
    this.cityPanel?.destroy(true);
    this.cityPanel = null;
    if (!this.selectedCityId) return;

    const state = GameState.get();
    const me = state.human;
    const city = getCity(this.selectedCityId);
    const isOwnedHub = me.hubs.includes(city.id);
    const cost = hubCost(city);
    const canAfford = me.cash >= cost;

    const w = 460;
    const h = 88;
    const px = (GAME_WIDTH - w) / 2;
    const py = GAME_HEIGHT - h - 30;

    const container = this.add.container(px, py);
    const bg = this.add.rectangle(0, 0, w, h, 0x0b1a2c, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, COLORS.panelBorder);

    const title = this.add.text(14, 8, `${city.name}, ${city.country}`, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '15px',
      color: COLORS.accentText,
      fontStyle: 'bold',
    });
    const tag = isOwnedHub
      ? '✓ One of your hubs'
      : `Buy as new hub: ${formatMoney(cost)}`;
    const sub = this.add.text(14, 30, `Demand ×${city.demand.toFixed(2)}   ·   ${tag}`, {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '12px',
      color: COLORS.text,
    });

    const close = new Button({
      scene: this,
      x: w - 22, y: 16,
      width: 28, height: 22,
      label: '×',
      onClick: () => { this.selectedCityId = null; this.refreshCityPanel(); },
    });
    container.add([bg, title, sub, close]);

    if (!isOwnedHub) {
      const buy = new Button({
        scene: this,
        x: w - 110, y: h - 22,
        width: 200, height: 28,
        label: canAfford ? `Buy hub  ${formatMoney(cost)}` : `Need ${formatMoney(cost)}`,
        onClick: () => {
          if (!canAfford) return;
          me.cash -= cost;
          me.hubs.push(city.id);
          state.stats.hubsBought++;
          state.pushNews(`${me.name} opened a new hub at ${city.name}.`);
          sound.play('buy');
          this.selectedCityId = null;
          this.refreshCityPanel();
        },
        disabled: !canAfford,
      });
      container.add(buy);
    } else {
      const setActiveBtn = new Button({
        scene: this,
        x: w - 110, y: h - 22,
        width: 200, height: 28,
        label: state.activeHub === city.id ? '✓ Active hub' : 'Set as active hub',
        onClick: () => {
          state.activeHub = city.id;
          this.refreshCityPanel();
        },
        disabled: state.activeHub === city.id,
      });
      container.add(setActiveBtn);
    }

    this.cityPanel = container;
    this.cityPanel.setDepth(100);
  }

  // ----- Dynamic layers (routes, planes) -----
  private drawRoutes() {
    this.routesLayer.clear();
    const state = GameState.get();
    const hovered = this.hoveredCityId;
    for (const player of state.players) {
      if (!this.visible[player.id]) continue;
      const isMe = player.id === state.human.id;
      const color = player.color;
      const baseAlpha = isMe ? 0.95 : 0.5;
      const baseWidth = isMe ? 2 : 1;
      for (const route of player.routes) {
        const touches = hovered && (route.fromCity === hovered || route.toCity === hovered);
        const alpha = touches ? 1.0 : (hovered ? baseAlpha * 0.25 : baseAlpha);
        const width = touches ? baseWidth + 2 : baseWidth;
        this.routesLayer.lineStyle(width, color, alpha);
        const a = this.cityXY(getCity(route.fromCity));
        const b = this.cityXY(getCity(route.toCity));
        this.routesLayer.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  }

  private drawPlanes() {
    this.planesLayer.removeAll(true);
    const state = GameState.get();
    const now = this.dateToMinutes(state.date);

    // Tally how many idle planes each player has at each airport so we can
    // spread them out around the airport instead of stacking them.
    const idleStacks: Record<string, number> = {}; // key = `${playerId}:${airportId}`
    const idleSlot:   Record<string, number> = {}; // per-plane slot index

    for (const player of state.players) {
      for (const plane of player.planes) {
        if (plane.status.kind !== 'idle') continue;
        const key = `${player.id}:${plane.status.airportId}`;
        idleSlot[plane.id] = idleStacks[key] ?? 0;
        idleStacks[key] = (idleStacks[key] ?? 0) + 1;
      }
    }

    for (const player of state.players) {
      if (!this.visible[player.id]) continue;
      const color = player.color;
      const isMe = player.id === state.human.id;
      for (const plane of player.planes) {
        const status = plane.status;
        const model = getPlaneModel(plane.modelId);
        const seats = model.seats;

        let pos: { x: number; y: number } | null = null;
        let rotation = 0;
        let isCargo = false;
        let isFlying = false;
        let dimmed = false;

        if (status.kind === 'flying' || status.kind === 'cargo' || status.kind === 'ferry') {
          const total = status.arrivesAt - status.departedAt;
          const elapsed = now - status.departedAt;
          const t = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 1;
          const a = this.cityXY(getCity(status.from));
          const b = this.cityXY(getCity(status.to));
          pos = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          rotation = Math.atan2(b.y - a.y, b.x - a.x);
          isCargo = status.kind === 'cargo';
          isFlying = true;
          dimmed = status.kind === 'ferry';   // empty ferry — slightly washed out
        } else if (status.kind === 'idle') {
          const c = this.cityXY(getCity(status.airportId));
          // Spread stacked idle planes around the airport in a small ring.
          const slot = idleSlot[plane.id] ?? 0;
          const total = idleStacks[`${player.id}:${status.airportId}`] ?? 1;
          if (total > 1) {
            const angle = (slot / total) * Math.PI * 2;
            const r = 18; // fixed pixel radius so it stays visible at any zoom
            pos = { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r };
          } else {
            pos = { x: c.x, y: c.y };
          }
          rotation = -Math.PI / 4; // parked icons pose nose-up-right
          // A plane that has a route assigned but is grounded (staffing cap)
          // gets dimmed so the player can see "I have planes that aren't flying".
          if (plane.routeId) dimmed = true;
        }
        if (!pos) continue;

        const icon = this.makePlaneIcon(pos.x, pos.y, seats, color, rotation, isMe, isCargo, isFlying, dimmed);
        this.planesLayer.add(icon);
      }
    }
  }

  /** Build a small airplane shape rotated to point along `rotationRad`. */
  private makePlaneIcon(
    x: number, y: number, seats: number, color: number,
    rotationRad: number, isMe: boolean, isCargo: boolean, isFlying: boolean,
    dimmed: boolean = false,
  ): Phaser.GameObjects.GameObject {
    const base = 3 + Math.sqrt(seats) * 0.45;
    const size = base * (isMe ? 1.2 : 1.0);

    const g = this.add.graphics({ x, y });
    const fillAlpha = dimmed ? 0.4 : (isFlying ? 1.0 : 0.85);
    const s = size;

    // Soft drop shadow underneath — sells altitude for in-flight planes and
    // gives parked icons a touch of depth against the city dot.
    if (isFlying) {
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(s * 0.2, s * 0.55, s * 2.4, s * 1.2);
    } else {
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(s * 0.15, s * 0.4, s * 2.0, s * 0.9);
    }

    g.fillStyle(color, fillAlpha);
    g.lineStyle(1, isCargo ? 0xffffff : 0x000000, isCargo ? 0.95 : 0.7);

    // Plane silhouette pointing along +x. Drawn from origin.
    // Fuselage diamond + wings sweep + tail fin.
    // Fuselage
    g.beginPath();
    g.moveTo( s * 1.2, 0);            // nose
    g.lineTo(-s * 0.6, s * 0.18);     // belly right
    g.lineTo(-s * 1.0, s * 0.18);     // tail right
    g.lineTo(-s * 1.0, -s * 0.18);    // tail left
    g.lineTo(-s * 0.6, -s * 0.18);    // belly left
    g.closePath();
    g.fillPath();
    g.strokePath();
    // Main wings (swept back)
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
    // Tail fin (small horizontal at rear)
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

  private dateToMinutes(d: { year: number; month: number; day: number; hour: number; minute: number }): number {
    return ((((d.year * 12 + (d.month - 1)) * 30 + (d.day - 1)) * 24 + d.hour) * 60) + d.minute;
  }
}
