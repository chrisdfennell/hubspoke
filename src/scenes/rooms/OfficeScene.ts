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
import { SponsorContract } from '../../state/Sponsor';
import { acceptSponsor, declineSponsor } from '../../systems/Sponsors';
import { dateToDay } from '../../state/demandModifiers';

const NAME_MIN = 1;
const NAME_MAX = 32;

type TabId = 'overview' | 'fleet' | 'routes' | 'standings' | 'sponsors';
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
    sponsors:  { column: '', dir: 'asc' },
  };

  constructor() { super('OfficeScene'); this.title = 'Office — Overview'; }

  buildRoom() {
    this.drawTabBar();
    switch (this.tab) {
      case 'overview':  this.buildOverview(); break;
      case 'fleet':     this.buildFleet(); break;
      case 'routes':    this.buildRoutes(); break;
      case 'standings': this.buildStandings(); break;
      case 'sponsors':  this.buildSponsors(); break;
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
      { id: 'sponsors',  label: 'Sponsors' },
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

  // ----- Sponsors -----
  private buildSponsors() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const today = dateToDay(state.date);
    let y = b.y + 130;

    this.addText(left, y, 'Sponsor Contracts', 18, COLORS.accentText);
    this.addText(left, y + 26,
      'Brands pay you to carry passengers to specific cities by a deadline. Every arrival of yours at the destination counts toward the target.',
      11, COLORS.textDim);
    y += 60;

    // -- Active contracts --
    this.addText(left, y, 'Active', 14, COLORS.accentText);
    y += 22;
    const active = state.sponsorActive.filter(s => s.ownerId === me.id);
    if (active.length === 0) {
      this.addText(left + 8, y, '— none accepted —', 12, COLORS.textDim);
      y += 22;
    } else {
      for (const s of active) {
        y = this.drawActiveSponsor(s, left, y, today);
      }
    }
    y += 12;

    // -- Available offers --
    this.addText(left, y, 'Available offers', 14, COLORS.accentText);
    y += 22;
    if (state.sponsorOffers.length === 0) {
      this.addText(left + 8, y, '— no offers right now. Check back tomorrow. —', 12, COLORS.textDim);
      y += 22;
    } else {
      for (const s of state.sponsorOffers) {
        y = this.drawOfferSponsor(s, left, y, today);
      }
    }
    y += 12;

    // -- Recent history (last 6) --
    const history = state.sponsorCompleted.slice(-6).reverse();
    if (history.length > 0) {
      this.addText(left, y, 'Recent history', 14, COLORS.accentText);
      y += 22;
      for (const s of history) {
        const label = s.status === 'completed' ? '★ Completed'
                    : s.status === 'failed'    ? '⚠ Failed'
                    :                            '· Expired';
        const color = s.status === 'completed' ? COLORS.accentText
                    : s.status === 'failed'    ? '#ff7b88'
                    :                            COLORS.textDim;
        this.addText(left + 8, y, `${label} — ${s.brand} (${getCity(s.toCity).name})`, 12, color);
        y += 18;
      }
    }
  }

  private drawActiveSponsor(s: SponsorContract, left: number, y: number, today: number): number {
    const b = this.panelBounds;
    const cardW = b.w - 60;
    const cardH = 64;
    this.content.add(this.add.rectangle(left + cardW / 2, y + cardH / 2, cardW, cardH, 0x162a3f)
      .setStrokeStyle(1, 0x335577));

    const daysLeft = Math.max(0, s.deadlineDay - today);
    const pct = Math.min(1, s.progress / s.target);
    const pctText = `${Math.round(pct * 100)}%`;
    const deadlineColor = daysLeft <= 2 ? '#ff7b88' : COLORS.text;

    this.addText(left + 12, y + 8, `${s.brand} → ${getCity(s.toCity).name}`, 14, COLORS.accentText);
    this.addText(left + 12, y + 30,
      `${s.progress.toLocaleString('en-US')} / ${s.target.toLocaleString('en-US')} pax  (${pctText})`,
      12, COLORS.text);

    // Progress bar
    const barX = left + 12;
    const barY = y + 50;
    const barW = cardW - 280;
    const barH = 6;
    this.content.add(this.add.rectangle(barX, barY, barW, barH, 0x223046).setOrigin(0));
    this.content.add(this.add.rectangle(barX, barY, barW * pct, barH, 0x7be08a).setOrigin(0));

    // Right column: reward + deadline
    const rx = left + cardW - 220;
    this.addText(rx, y + 8, `Reward: ${formatMoney(s.reward)}  +${s.repReward} rep`, 12, '#ffc857');
    this.addText(rx, y + 30, `Deadline: day ${s.deadlineDay}  (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`, 12, deadlineColor);

    return y + cardH + 8;
  }

  private drawOfferSponsor(s: SponsorContract, left: number, y: number, today: number): number {
    const b = this.panelBounds;
    const cardW = b.w - 60;
    const cardH = 76;
    this.content.add(this.add.rectangle(left + cardW / 2, y + cardH / 2, cardW, cardH, 0x142036)
      .setStrokeStyle(1, 0x335577));

    const offerDaysLeft = Math.max(0, s.offerExpiresOnDay - today);
    const duration = s.deadlineDay - (s.offerExpiresOnDay - 3);  // OFFER_DURATION_DAYS=3

    this.addText(left + 12, y + 6, s.brand, 14, COLORS.accentText);
    this.addText(left + 12, y + 26, `${s.pitch} to ${getCity(s.toCity).name}.`, 12, COLORS.text);
    this.addText(left + 12, y + 46,
      `${s.target.toLocaleString('en-US')} pax over ${duration} days  ·  Reward ${formatMoney(s.reward)} + ${s.repReward} rep  ·  Penalty: −${s.repPenalty} rep`,
      12, COLORS.textDim);

    // Right column: offer expiry + buttons
    const rx = left + cardW - 240;
    const expiryColor = offerDaysLeft <= 1 ? '#ff7b88' : COLORS.textDim;
    this.addText(rx, y + 6, `Offer expires in ${offerDaysLeft} day${offerDaysLeft === 1 ? '' : 's'}`, 11, expiryColor);

    const me = GameState.get().human;
    const acceptBtn = new Button({
      scene: this,
      x: rx + 60, y: y + 50, width: 110, height: 26,
      label: 'Accept',
      bg: 0x2f6042,
      bgHover: 0x3f8055,
      onClick: () => {
        if (acceptSponsor(me, s.id)) this.rebuild();
      },
    });
    const declineBtn = new Button({
      scene: this,
      x: rx + 180, y: y + 50, width: 80, height: 26,
      label: 'Decline',
      bg: 0x402020,
      bgHover: 0x603030,
      onClick: () => {
        if (declineSponsor(s.id)) this.rebuild();
      },
    });
    this.content.add(acceptBtn);
    this.content.add(declineBtn);

    return y + cardH + 8;
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
