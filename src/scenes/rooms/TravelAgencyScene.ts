import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../systems/Clock';
import { CITIES, distanceKm, getCity, getPlaneModel } from '../../state/catalog';
import { suggestedTicketPrice, expectedLoadFactor, flightProfit, competingRoutes, getFuelPrice } from '../../systems/Economy';
import { getDemandMult } from '../../state/demandModifiers';
import { Route } from '../../state/Route';
import { sound } from '../../systems/Sound';
import {
  gateExpansionCost, MAX_GATES_PER_HUB, STARTING_GATES,
} from '../../state/Player';

type Tab = 'routes' | 'airport';

export class TravelAgencyScene extends RoomScene {
  /** Persisted across rebuild() calls (Phaser reuses the scene instance), so
   *  switching tabs and tweaking ticket prices doesn't bounce you back. Reset
   *  on close because RoomScene.create() runs fresh on each entry. */
  private currentTab: Tab = 'routes';

  constructor() { super('TravelAgencyScene'); this.title = 'Travel Agency'; }

  create() {
    this.currentTab = 'routes';
    super.create();
  }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const topY = b.y + 80;

    // Make sure activeHub is one we actually own (a hub may have been removed
    // somehow, or this is a legacy save).
    if (!me.hubs.includes(state.activeHub)) {
      state.activeHub = me.hubs[0];
    }

    this.buildHubPicker(left, topY);
    this.buildTabPicker(left, topY + 32);

    // Tab body — hub picker + tab row eat ~70 px; sub-builders treat startY
    // as their first content row.
    const startY = topY + 70;
    if (this.currentTab === 'routes') this.buildRoutesTab(startY);
    else this.buildAirportTab(startY);
  }

  private buildHubPicker(left: number, topY: number) {
    const state = GameState.get();
    const me = state.human;
    let hx = left;
    const hubLabel = this.addText(hx, topY - 6, 'Hub:', 12, COLORS.textDim);
    hx += 36;
    for (const hubId of me.hubs) {
      const city = getCity(hubId);
      const isActive = hubId === state.activeHub;
      const w = Math.max(90, 14 + city.name.length * 7);
      const chip = new Button({
        scene: this,
        x: hx + w / 2,
        y: topY,
        width: w,
        height: 24,
        label: city.name,
        bg: isActive ? 0x3d6a92 : 0x14304a,
        bgHover: isActive ? 0x4a7da8 : 0x2a5780,
        onClick: () => {
          state.activeHub = hubId;
          this.rebuild();
        },
      });
      this.content.add(chip);
      hx += w + 8;
    }
    if (me.hubs.length === 1) {
      this.addText(hx + 4, topY - 6, '— click a city in the Control Tower map to buy a new hub.', 11, COLORS.textDim);
    }
    void hubLabel;
  }

  private buildTabPicker(left: number, topY: number) {
    const tabs: Array<{ id: Tab; label: string }> = [
      { id: 'routes',  label: 'Routes' },
      { id: 'airport', label: 'Airport' },
    ];
    let tx = left;
    for (const t of tabs) {
      const w = 110;
      const isActive = this.currentTab === t.id;
      const btn = new Button({
        scene: this,
        x: tx + w / 2,
        y: topY,
        width: w,
        height: 24,
        label: t.label,
        bg: isActive ? 0x3d6a92 : 0x14304a,
        bgHover: isActive ? 0x4a7da8 : 0x2a5780,
        onClick: () => {
          this.currentTab = t.id;
          this.scrollTo(0);
          this.rebuild();
        },
      });
      this.content.add(btn);
      tx += w + 8;
    }
  }

  private buildRoutesTab(startY: number) {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const colWidth = (b.w - 60) / 2;
    const rightCol = left + colWidth + 20;
    const activeCity = getCity(state.activeHub);

    // LEFT: open new routes from active hub. Sort by distance ascending
    // so nearest destinations surface first — the catalog order put
    // Hawaii at the top, which read as nonsensical from e.g. JFK.
    this.addText(left, startY, `New Routes from ${activeCity.name}`, 16, COLORS.accentText);
    let y = startY + 30;
    this.addText(left,       y, 'Destination', 12, COLORS.textDim);
    this.addText(left + 200, y, 'Distance',    12, COLORS.textDim);
    this.addText(left + 290, y, 'Suggested $', 12, COLORS.textDim);
    y += 20;

    const destinations = CITIES
      .filter(c => c.id !== activeCity.id)
      .map(c => ({ city: c, dist: distanceKm(activeCity, c) }))
      .sort((a, b) => a.dist - b.dist);

    for (const { city: dest, dist } of destinations) {
      const already = me.routes.some(r =>
        (r.fromCity === activeCity.id && r.toCity === dest.id) ||
        (r.fromCity === dest.id && r.toCity === activeCity.id)
      );
      const price = suggestedTicketPrice(dist, activeCity.demand, dest.demand);

      this.addText(left,       y + 6, dest.name, 13);
      this.addText(left + 200, y + 6, `${Math.round(dist)} km`, 13);
      this.addText(left + 290, y + 6, formatMoney(price), 13);

      const btn = new Button({
        scene: this,
        x: left + 430,
        y: y + 14,
        width: 110,
        height: 26,
        label: already ? 'Open' : 'Open route',
        onClick: () => {
          if (already) return;
          const r = new Route(me.id, activeCity.id, dest.id, dist, price);
          me.routes.push(r);
          state.stats.routesOpened++;
          state.pushNews(`${me.name} opened route ${activeCity.name} ↔ ${dest.name}.`);
          sound.play('cashGain');
          this.rebuild();
        },
        disabled: already,
      });
      this.content.add(btn);
      y += 30;
    }

    // RIGHT: existing routes — filter to those touching the active hub.
    const hubRoutes = me.routes.filter(r =>
      r.fromCity === activeCity.id || r.toCity === activeCity.id
    );
    this.addText(rightCol, startY, `Your Routes from ${activeCity.name}`, 16, COLORS.accentText);
    y = startY + 30;

    if (hubRoutes.length === 0) {
      const msg = me.routes.length === 0
        ? 'No routes yet — open one from the list at left.'
        : `No routes touch ${activeCity.name}. Switch hubs above to see your other routes.`;
      this.addText(rightCol, y, msg, 13, COLORS.textDim);
    }

    for (const route of hubRoutes) {
      const a = getCity(route.fromCity);
      const c = getCity(route.toCity);
      const lf = expectedLoadFactor(route);
      const assigned = me.planes.find(p => p.routeId === route.id);

      const headerTxt = this.addText(rightCol, y, `${a.name}  ↔  ${c.name}   ·   ${Math.round(route.distanceKm)} km`, 14, COLORS.text);
      this.tooltip.attach(headerTxt, () => this.routeTooltip(route));
      y += 20;

      this.addText(rightCol,       y, 'Ticket', 12, COLORS.textDim);
      this.addText(rightCol + 80,  y, formatMoney(route.ticketPrice), 14, COLORS.accentText);
      this.addText(rightCol + 280, y, `Load factor: ${Math.round(lf * 100)}%`, 12, COLORS.textDim);

      // Price adjusters — four steps for fast or fine tuning. Sit right next
      // to the ticket value so the relationship is obvious.
      const priceBtns: Array<{ label: string; delta: number; offset: number }> = [
        { label: '−$50', delta: -50, offset: 160 },
        { label: '−$10', delta: -10, offset: 198 },
        { label: '+$10', delta:  10, offset: 236 },
        { label: '+$50', delta:  50, offset: 274 },
      ];
      for (const b of priceBtns) {
        const btn = new Button({
          scene: this,
          x: rightCol + b.offset, y: y + 6, width: 36, height: 22,
          label: b.label,
          onClick: () => {
            route.ticketPrice = Math.max(20, route.ticketPrice + b.delta);
            this.rebuild();
          },
        });
        this.content.add(btn);
      }
      y += 24;

      // Profit estimate vs assigned plane (or first eligible idle plane)
      const sample = assigned ?? me.planes.find(p =>
        !p.routeId && p.status.kind === 'idle' && getPlaneModel(p.modelId).range >= route.distanceKm
      );
      if (sample) {
        const fp = flightProfit(sample, route);
        const sign = fp.profit >= 0 ? '+' : '';
        this.addText(
          rightCol, y,
          `Est: ${fp.passengers} pax · rev ${formatMoney(fp.revenue)} · fuel ${formatMoney(fp.fuel)} · ${sign}${formatMoney(fp.profit)} / flight`,
          12, fp.profit >= 0 ? COLORS.text : '#ff9aa6'
        );
        y += 18;
      } else {
        this.addText(rightCol, y, 'No eligible plane to estimate.', 12, COLORS.textDim);
        y += 18;
      }

      // Lifetime tallies for this route — accumulated by Flights on every
      // arrival. Helps the player evaluate which routes are actually pulling
      // their weight when tuning ticket prices or deciding what to close.
      if (route.lifetimeFlights > 0) {
        const avgPax = route.lifetimePassengers / route.lifetimeFlights;
        const avgLF = avgPax / (sample?.model.seats ?? 1);
        const profitSign = route.lifetimeProfit >= 0 ? '+' : '';
        const lifeColor = route.lifetimeProfit >= 0 ? COLORS.textDim : '#ff9aa6';
        this.addText(
          rightCol, y,
          `Lifetime: ${route.lifetimeFlights} flights · ${route.lifetimePassengers.toLocaleString('en-US')} pax (avg LF ${Math.round(avgLF * 100)}%) · ${profitSign}${formatMoney(route.lifetimeProfit)} profit`,
          11, lifeColor,
        );
        y += 18;
      }

      // Assignment row
      this.addText(rightCol, y, 'Assigned plane:', 12, COLORS.textDim);
      this.addText(rightCol + 110, y, assigned ? assigned.name : '— none —', 13, assigned ? COLORS.text : COLORS.textDim);

      // Eligible: in range, unassigned (or already this route), and currently
      // sitting at one of the route's endpoints — a plane parked at HNL can't
      // operate an LAX↔NRT route until it's ferried.
      const eligible = me.planes.filter(p => {
        if (getPlaneModel(p.modelId).range < route.distanceKm) return false;
        if (p.routeId && p.routeId !== route.id) return false;
        if (p.status.kind !== 'idle') return p.routeId === route.id;
        return p.status.airportId === route.fromCity || p.status.airportId === route.toCity;
      });
      y += 22;
      this.addText(rightCol, y, 'Pick:', 12, COLORS.textDim);
      let bx = rightCol + 50;
      // Buttons for each eligible plane (compact)
      for (const p of eligible) {
        const isThis = p.routeId === route.id;
        const w = Math.max(80, 8 + p.name.length * 6.5);
        const btn = new Button({
          scene: this, x: bx + w / 2, y: y + 12, width: w, height: 24,
          label: isThis ? `✓ ${p.name}` : p.name,
          onClick: () => {
            // Unassign this plane from any other route, then either set or unset.
            if (p.routeId === route.id) {
              p.routeId = null;
            } else {
              p.routeId = route.id;
            }
            this.rebuild();
          },
        });
        this.content.add(btn);
        bx += w + 6;
      }
      if (eligible.length === 0) {
        this.addText(rightCol + 50, y, 'No plane has range for this route.', 12, '#ff9aa6');
      }
      y += 38;
    }
  }

  /** "Airport" tab — hub infrastructure upgrades. For now this is just the
   *  apron gate count: every hub starts with STARTING_GATES (8), with up to
   *  MAX_GATES_PER_HUB total purchasable. Cost escalates and is scaled by
   *  the hub's demand multiplier (see gateExpansionCost). */
  private buildAirportTab(startY: number) {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const activeCity = getCity(state.activeHub);
    const gates = me.gatesAt(activeCity.id);

    this.addText(left, startY, `${activeCity.name} — Apron`, 16, COLORS.accentText);
    let y = startY + 30;

    this.addText(left, y, `Gates owned: ${gates} / ${MAX_GATES_PER_HUB}   (start: ${STARTING_GATES})`, 14);
    y += 24;

    this.addText(
      left, y,
      'Each gate adds one parking stall on the apron. Planes share gates when '
      + 'you exceed the cap — buy more to keep your fleet visible and orderly.',
      12, COLORS.textDim,
    );
    y += 36;

    if (gates >= MAX_GATES_PER_HUB) {
      this.addText(left, y, `✓ Maxed out at ${MAX_GATES_PER_HUB} gates. No further expansion available.`,
        13, COLORS.text);
      y += 24;
    } else {
      const cost = gateExpansionCost(gates, activeCity);
      const canAfford = me.cash >= cost;

      this.addText(left, y, `Next gate (#${gates + 1})`, 13, COLORS.text);
      this.addText(left + 160, y, `Cost: ${formatMoney(cost)}`, 13, canAfford ? COLORS.text : '#ff9aa6');
      const buyBtn = new Button({
        scene: this,
        x: left + 380, y: y + 7,
        width: 160, height: 26,
        label: canAfford ? `Buy +1 gate` : `Need ${formatMoney(cost)}`,
        onClick: () => {
          if (!canAfford) return;
          me.cash -= cost;
          me.gateCounts[activeCity.id] = gates + 1;
          state.pushNews(
            `${me.name} added gate #${gates + 1} at ${activeCity.name} — apron capacity now ${gates + 1}.`,
          );
          sound.play('buy');
          this.rebuild();
        },
        disabled: !canAfford,
      });
      this.content.add(buyBtn);
      y += 36;

      // Future-gate cost preview so the player can plan the spend.
      this.addText(left, y, 'Remaining expansion costs at this hub:', 12, COLORS.textDim);
      y += 18;
      for (let g = gates + 1; g < MAX_GATES_PER_HUB; g++) {
        const c = gateExpansionCost(g, activeCity);
        this.addText(left + 12, y, `Gate #${g + 1}: ${formatMoney(c)}`, 12, COLORS.textDim);
        y += 16;
      }
    }
  }

  /** Per-route tooltip — pricing decomposition, demand modifier, competition. */
  private routeTooltip(route: Route): string {
    const state = GameState.get();
    const a = getCity(route.fromCity);
    const b = getCity(route.toCity);
    const fairPrice = suggestedTicketPrice(route.distanceKm, a.demand, b.demand);
    const lf = expectedLoadFactor(route);
    const me = state.human;
    const assigned = me.planes.find(p => p.routeId === route.id);
    const sample = assigned ?? me.planes.find(p =>
      !p.routeId && p.status.kind === 'idle' && getPlaneModel(p.modelId).range >= route.distanceKm
    );
    const demandA = getDemandMult(a.id, state.date);
    const demandB = getDemandMult(b.id, state.date);
    const rivals = competingRoutes(route);
    const fuel = getFuelPrice();

    const lines: string[] = [
      `${a.name} ↔ ${b.name}   (${Math.round(route.distanceKm)} km)`,
      `Suggested fair price: ${formatMoney(fairPrice)}`,
      `Your ticket: ${formatMoney(route.ticketPrice)}  (×${(route.ticketPrice / fairPrice).toFixed(2)} of fair)`,
      `Expected load factor: ${Math.round(lf * 100)}%`,
    ];
    if (demandA !== 1 || demandB !== 1) {
      const avg = (demandA + demandB) / 2;
      lines.push(`Active demand modifier: ×${avg.toFixed(2)} (events in effect)`);
    }
    if (state.settings.showCompetitorPrices) {
      if (rivals.length > 0) {
        const cheaper = rivals.filter(r => r.ticketPrice < route.ticketPrice).length;
        lines.push(`Competition: ${rivals.length} rival route(s) on this pair, ${cheaper} cheaper than you`);
        // Per-rival price breakdown: shows whose price is what, so the player
        // can decide whether to undercut a specific airline.
        for (const r of rivals) {
          const owner = state.players.find(p => p.routes.some(rr => rr.id === r.id));
          lines.push(`  ${owner?.name ?? '?'}: ${formatMoney(r.ticketPrice)}`);
        }
      } else {
        lines.push(`Competition: none — full demand`);
      }
    } else {
      lines.push(`Competition: hidden (enable in Settings)`);
    }
    if (sample) {
      const fp = flightProfit(sample, route);
      const fuelCost = route.distanceKm * sample.model.fuelPerKm * fuel;
      lines.push('');
      lines.push(`On ${sample.name} (${sample.model.name}):`);
      lines.push(`  ${fp.passengers} pax × ${formatMoney(route.ticketPrice)} = ${formatMoney(fp.revenue)}`);
      lines.push(`  Fuel @ $${fuel.toFixed(2)}/L: ${formatMoney(fuelCost)}`);
      lines.push(`  Ops/gate: ${formatMoney(fp.ops)}`);
      lines.push(`  Net: ${formatMoney(fp.profit)} ${fp.profit >= 0 ? '✓' : '✗'} per flight`);
    }
    return lines.join('\n');
  }
}
