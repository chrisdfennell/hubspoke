import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { formatMoney } from '../../systems/Clock';
import { planeStatusText, dispatchFerry } from '../../systems/Flights';
import { getCity, distanceKm } from '../../state/catalog';
import { getFuelPrice } from '../../systems/Economy';
import { Player } from '../../state/Player';
import { Plane } from '../../state/Plane';
import { Route } from '../../state/Route';

const NAME_MIN = 1;
const NAME_MAX = 32;

type TabId = 'overview' | 'fleet' | 'routes' | 'standings';
type SortDir = 'asc' | 'desc';

interface SortState { column: string; dir: SortDir; }

export class OfficeScene extends RoomScene {
  private tab: TabId = 'overview';
  /** Plane currently expanded with the inline "ferry to which hub?" picker. */
  private ferrySelectedPlaneId: string | null = null;
  private sort: Record<TabId, SortState> = {
    overview:  { column: '', dir: 'asc' },
    fleet:     { column: 'name', dir: 'asc' },
    routes:    { column: 'distance', dir: 'asc' },
    standings: { column: 'cash', dir: 'desc' },
  };

  constructor() { super('OfficeScene'); this.title = 'Office — Overview'; }

  buildRoom() {
    this.drawTabBar();
    switch (this.tab) {
      case 'overview':  this.buildOverview(); break;
      case 'fleet':     this.buildFleet(); break;
      case 'routes':    this.buildRoutes(); break;
      case 'standings': this.buildStandings(); break;
    }
  }

  // ----- Tab bar -----
  private drawTabBar() {
    const b = this.panelBounds;
    const tabs: { id: TabId; label: string }[] = [
      { id: 'overview',  label: 'Overview' },
      { id: 'fleet',     label: 'Fleet' },
      { id: 'routes',    label: 'Routes' },
      { id: 'standings', label: 'Standings' },
    ];
    let x = b.x + 30;
    const y = b.y + 80;
    for (const t of tabs) {
      const isActive = t.id === this.tab;
      const w = 110;
      const btn = new Button({
        scene: this,
        x: x + w / 2, y, width: w, height: 30,
        label: t.label,
        bg: isActive ? 0x4a7a5e : 0x1a3450,
        bgHover: isActive ? 0x5a8a6e : 0x2a5780,
        onClick: () => {
          if (this.tab === t.id) return;
          this.tab = t.id;
          this.scrollTo(0);
          this.rebuild();
        },
      });
      this.content.add(btn);
      x += w + 4;
    }
  }

  // ----- Overview -----
  private buildOverview() {
    const me = GameState.get().human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 130;

    // Airline name + rename button
    this.addText(left, y, `Airline:  ${me.name}`, 16, COLORS.accentText);
    const renameAirlineBtn = new Button({
      scene: this,
      x: left + 360, y: y + 8, width: 120, height: 26,
      label: 'Rename airline',
      onClick: () => {
        Modal.prompt(this, {
          title: 'Rename airline',
          message: 'Choose a new name for your airline:',
          default: me.name,
          minLen: NAME_MIN,
          maxLen: NAME_MAX,
          onSubmit: (next) => {
            const old = me.name;
            me.name = next;
            GameState.get().pushNews(`${old} rebranded as ${next}.`);
            this.rebuild();
          },
        });
      },
    });
    this.content.add(renameAirlineBtn);
    y += 40;

    // Stat tiles
    const tile = (col: number, row: number, label: string, value: string, valueColor: string) => {
      const tx = left + col * 240;
      const ty = y + row * 70;
      this.content.add(this.add.rectangle(tx + 110, ty + 30, 220, 56, 0x14304a)
        .setStrokeStyle(1, 0x335577));
      this.addText(tx + 12, ty + 8, label, 11, COLORS.textDim);
      this.addText(tx + 12, ty + 26, value, 18, valueColor);
    };
    tile(0, 0, 'CASH',          formatMoney(me.cash),       me.cash < 0 ? '#ff7b88' : COLORS.accentText);
    tile(1, 0, 'OUTSTANDING LOAN', formatMoney(me.loan),    me.loan > 0 ? '#ffc857' : COLORS.text);
    tile(2, 0, 'SAVINGS',       formatMoney(me.savings),    COLORS.text);
    tile(0, 1, 'REPUTATION',    `${Math.round(me.reputation)} / 100`, COLORS.text);
    tile(1, 1, 'FLEET',         `${me.planes.length} plane(s)`, COLORS.text);
    tile(2, 1, 'ROUTES',        `${me.routes.length} active`, COLORS.text);

    y += 160;
    this.addText(left, y, `Pilots: ${me.pilots}    Mechanics: ${me.mechanics}    Staffed cap: ${Math.min(me.pilots, me.mechanics)}`, 13);
    y += 30;

    // -- Hubs section: list each hub with quick stats + "set active" buttons. --
    const state = GameState.get();
    this.addText(left, y, 'Hubs', 16, COLORS.accentText);
    y += 26;
    this.addText(left,        y, 'City',              12, COLORS.textDim);
    this.addText(left + 220,  y, 'Routes',            12, COLORS.textDim);
    this.addText(left + 320,  y, 'Idle / total plns', 12, COLORS.textDim);
    y += 20;
    for (const hubId of me.hubs) {
      const city = getCity(hubId);
      const routesHere = me.routes.filter(r => r.fromCity === hubId || r.toCity === hubId).length;
      const planesHere = me.planes.filter(p => p.status.kind === 'idle' && p.status.airportId === hubId).length;
      const totalAtHub = me.planes.filter(p =>
        (p.status.kind === 'idle' && p.status.airportId === hubId)
        || (p.status.kind === 'maintenance' && p.status.airportId === hubId)
      ).length;
      const isActive = state.activeHub === hubId;
      this.addText(left,       y + 4, `${isActive ? '►' : ' '} ${city.name}`, 14, isActive ? COLORS.accentText : COLORS.text);
      this.addText(left + 220, y + 4, routesHere.toString(), 13);
      this.addText(left + 320, y + 4, `${planesHere} / ${totalAtHub}`, 13);
      const setBtn = new Button({
        scene: this,
        x: left + 540, y: y + 12, width: 140, height: 24,
        label: isActive ? '✓ Active' : 'Set as active',
        bg: isActive ? 0x4a7a5e : 0x2d4a6a,
        bgHover: isActive ? 0x5a8a6e : 0x3d6a92,
        disabled: isActive,
        onClick: () => {
          state.activeHub = hubId;
          this.rebuild();
        },
      });
      this.content.add(setBtn);
      y += 28;
    }
    if (me.hubs.length === 1) {
      this.addText(left, y + 4, 'Open the Control Tower map and click a city to buy a new hub.', 12, COLORS.textDim);
      y += 24;
    }

    y += 12;
    this.addText(left, y, 'Use the tabs above to drill into Fleet, Routes, or Standings.', 12, COLORS.textDim);
  }

  // ----- Fleet tab -----
  private buildFleet() {
    const me = GameState.get().human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 130;

    if (me.planes.length === 0) {
      this.addText(left, y, 'No planes yet — visit the Workshop to buy your first plane.', 13, COLORS.textDim);
      return;
    }

    const cols: { id: string; label: string; x: number; sort: (p: Plane) => string | number }[] = [
      { id: 'name',   label: 'Name',   x: 0,   sort: p => p.name.toLowerCase() },
      { id: 'model',  label: 'Model',  x: 240, sort: p => p.model.name },
      { id: 'cond',   label: 'Cond',   x: 460, sort: p => p.condition },
      { id: 'route',  label: 'Route',  x: 530, sort: p => {
          const r = me.routes.find(x => x.id === p.routeId);
          return r ? `${r.fromCity}-${r.toCity}` : 'zzz';
      } },
      { id: 'status', label: 'Status', x: 720, sort: p => p.status.kind },
    ];

    this.drawSortableHeader(cols, left, y, 'fleet');
    y += 24;

    const sorted = [...me.planes];
    const s = this.sort.fleet;
    const col = cols.find(c => c.id === s.column) ?? cols[0];
    sorted.sort((a, b) => {
      const av = col.sort(a), bv = col.sort(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return s.dir === 'asc' ? cmp : -cmp;
    });

    for (const plane of sorted) {
      const route = plane.routeId ? me.routes.find(r => r.id === plane.routeId) : undefined;
      this.addText(left,             y + 6, plane.name, 13);
      this.addText(left + cols[1].x, y + 6, plane.model.name, 13);
      this.addText(left + cols[2].x, y + 6, `${Math.round(plane.condition * 100)}%`, 13,
        plane.condition < 0.5 ? '#ff7b88' : COLORS.text);
      this.addText(left + cols[3].x, y + 6, route ? `${route.fromCity.toUpperCase()}↔${route.toCity.toUpperCase()}` : '—', 13,
        route ? COLORS.text : COLORS.textDim);
      this.addText(left + cols[4].x, y + 6, planeStatusText(plane, route), 13);

      const renameBtn = new Button({
        scene: this,
        x: left + 950, y: y + 14, width: 80, height: 24,
        label: 'Rename',
        onClick: () => {
          Modal.prompt(this, {
            title: 'Rename plane',
            message: `New name for ${plane.name}:`,
            default: plane.name,
            minLen: NAME_MIN,
            maxLen: NAME_MAX,
            onSubmit: (next) => {
              plane.name = next;
              this.rebuild();
            },
          });
        },
      });
      this.content.add(renameBtn);

      // Ferry: only valid when parked, and only useful when at least one
      // OTHER hub exists to fly to. Click expands an inline row of hub
      // choices below this plane.
      const canFerry = plane.status.kind === 'idle' && me.hubs.length > 1;
      const isExpanded = this.ferrySelectedPlaneId === plane.id;
      const ferryBtn = new Button({
        scene: this,
        x: left + 1040, y: y + 14, width: 80, height: 24,
        label: isExpanded ? 'Cancel' : 'Ferry',
        disabled: !canFerry,
        bg: isExpanded ? 0x4a3046 : 0x2d4a6a,
        bgHover: isExpanded ? 0x5a4056 : 0x3d6a92,
        onClick: () => {
          this.ferrySelectedPlaneId = isExpanded ? null : plane.id;
          this.rebuild();
        },
      });
      this.content.add(ferryBtn);
      y += 28;

      // Inline ferry-destination picker for the selected plane.
      if (isExpanded && plane.status.kind === 'idle') {
        y = this.drawFerryPicker(plane, me, left, y);
      }
    }
  }

  /** Draw an inline row of "Ferry to: [city — fuel cost]" buttons below a
   *  plane. Disables out-of-range / unaffordable destinations with a reason
   *  baked into the label. Returns the next y position. */
  private drawFerryPicker(plane: Plane, me: Player, left: number, y: number): number {
    if (plane.status.kind !== 'idle') return y;
    const here = plane.status.airportId;
    const fuel = getFuelPrice();

    // Backdrop strip so the popover reads as one unit.
    const stripH = 36;
    const stripW = 1040;
    this.content.add(this.add
      .rectangle(left + stripW / 2, y + stripH / 2, stripW, stripH, 0x14304a, 0.6)
      .setStrokeStyle(1, 0x335577));

    this.addText(left + 12, y + 12, `Ferry to →`, 12, COLORS.accentText);

    let bx = left + 110;
    let any = false;
    for (const hubId of me.hubs) {
      if (hubId === here) continue;
      any = true;
      const dest = getCity(hubId);
      const dist = distanceKm(getCity(here), dest);
      const cost = Math.round(plane.model.fuelPerKm * dist * fuel);
      const inRange = dist <= plane.model.range;
      const canAfford = me.cash >= cost;
      const tag = !inRange
        ? 'out of range'
        : !canAfford
          ? `need ${formatMoney(cost)}`
          : `−${formatMoney(cost)}`;
      const label = `${dest.name}   ${tag}`;
      const labelW = Math.max(190, 14 + label.length * 6.5);

      const btn = new Button({
        scene: this,
        x: bx + labelW / 2, y: y + 14, width: labelW, height: 26,
        label,
        disabled: !inRange || !canAfford,
        onClick: () => {
          const result = dispatchFerry(me, plane, hubId);
          if (!result.ok) {
            Modal.alert(this, {
              title: "Can't ferry plane",
              message: result.reason ?? 'Unknown error.',
            });
            return;
          }
          this.ferrySelectedPlaneId = null;
          this.rebuild();
        },
      });
      this.content.add(btn);
      bx += labelW + 6;
    }
    if (!any) {
      this.addText(left + 110, y + 12, 'No other hubs available.', 12, COLORS.textDim);
    }
    return y + stripH + 4;
  }

  // ----- Routes tab -----
  private buildRoutes() {
    const me = GameState.get().human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 130;

    if (me.routes.length === 0) {
      this.addText(left, y, 'No routes yet — visit the Travel Agency to open one.', 13, COLORS.textDim);
      return;
    }

    const cols: { id: string; label: string; x: number; sort: (r: Route) => string | number }[] = [
      { id: 'pair',     label: 'From → To', x: 0,   sort: r => `${getCity(r.fromCity).name}-${getCity(r.toCity).name}` },
      { id: 'distance', label: 'Distance',  x: 360, sort: r => r.distanceKm },
      { id: 'ticket',   label: 'Ticket',    x: 470, sort: r => r.ticketPrice },
      { id: 'assigned', label: 'Assigned',  x: 580, sort: r => {
          const p = me.planes.find(x => x.routeId === r.id);
          return p ? p.name.toLowerCase() : 'zzz';
      } },
    ];

    this.drawSortableHeader(cols, left, y, 'routes');
    y += 24;

    const sorted = [...me.routes];
    const s = this.sort.routes;
    const col = cols.find(c => c.id === s.column) ?? cols[0];
    sorted.sort((a, b) => {
      const av = col.sort(a), bv = col.sort(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return s.dir === 'asc' ? cmp : -cmp;
    });

    for (const r of sorted) {
      const a = getCity(r.fromCity);
      const c = getCity(r.toCity);
      const assigned = me.planes.find(p => p.routeId === r.id);
      this.addText(left,             y + 6, `${a.name}  →  ${c.name}`, 13);
      this.addText(left + cols[1].x, y + 6, `${Math.round(r.distanceKm)} km`, 13);
      this.addText(left + cols[2].x, y + 6, formatMoney(r.ticketPrice), 13);
      this.addText(left + cols[3].x, y + 6, assigned ? assigned.name : '—', 13,
        assigned ? COLORS.text : COLORS.textDim);
      y += 22;
    }
  }

  // ----- Standings tab -----
  private buildStandings() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 130;

    const cols: { id: string; label: string; x: number; sort: (p: Player) => string | number }[] = [
      { id: 'name',   label: 'Airline',    x: 0,   sort: p => p.name.toLowerCase() },
      { id: 'cash',   label: 'Cash',       x: 240, sort: p => p.cash },
      { id: 'loan',   label: 'Loan',       x: 380, sort: p => p.loan },
      { id: 'fleet',  label: 'Fleet',      x: 500, sort: p => p.planes.length },
      { id: 'routes', label: 'Routes',     x: 580, sort: p => p.routes.length },
      { id: 'rep',    label: 'Reputation', x: 660, sort: p => p.reputation },
      { id: 'status', label: 'Status',     x: 800, sort: p => state.takenOverBy[p.id] ? 'taken' : 'active' },
    ];

    this.drawSortableHeader(cols, left, y, 'standings');
    y += 24;

    const sorted = [...state.players];
    const s = this.sort.standings;
    const col = cols.find(c => c.id === s.column) ?? cols[1];
    sorted.sort((a, b) => {
      const av = col.sort(a), bv = col.sort(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return s.dir === 'asc' ? cmp : -cmp;
    });

    for (const p of sorted) {
      const isMe = p.id === me.id;
      const taken = !!state.takenOverBy[p.id];
      const labelColor = taken ? '#7a8aa0' : (isMe ? COLORS.accentText : COLORS.text);
      this.addText(left,             y + 6, `${isMe ? '►' : ' '} ${p.name}`, 13, labelColor);
      this.addText(left + cols[1].x, y + 6, formatMoney(p.cash), 13, labelColor);
      this.addText(left + cols[2].x, y + 6, formatMoney(p.loan), 13, labelColor);
      this.addText(left + cols[3].x, y + 6, p.planes.length.toString(), 13, labelColor);
      this.addText(left + cols[4].x, y + 6, p.routes.length.toString(), 13, labelColor);
      this.addText(left + cols[5].x, y + 6, Math.round(p.reputation).toString(), 13, labelColor);
      this.addText(left + cols[6].x, y + 6, taken ? 'taken over' : 'active', 13, labelColor);
      y += 22;
    }
  }

  // ----- Sortable header helper -----
  private drawSortableHeader<T>(
    cols: { id: string; label: string; x: number; sort: (t: T) => string | number }[],
    left: number, y: number, tab: TabId,
  ) {
    const s = this.sort[tab];
    for (const c of cols) {
      const isSortCol = c.id === s.column;
      const arrow = isSortCol ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';
      const labelColor = isSortCol ? COLORS.accentText : COLORS.textDim;
      const txt = this.addText(left + c.x, y, c.label + arrow, 12, labelColor);
      // Make the header label clickable.
      txt.setInteractive({ useHandCursor: true });
      txt.on('pointerdown', () => {
        if (this.sort[tab].column === c.id) {
          this.sort[tab].dir = this.sort[tab].dir === 'asc' ? 'desc' : 'asc';
        } else {
          this.sort[tab].column = c.id;
          this.sort[tab].dir = 'asc';
        }
        this.rebuild();
      });
    }
  }
}
