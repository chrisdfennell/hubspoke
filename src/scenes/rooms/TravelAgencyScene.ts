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

export class TravelAgencyScene extends RoomScene {
  constructor() { super('TravelAgencyScene'); this.title = 'Travel Agency — Routes'; }

  buildRoom() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    const colWidth = (b.w - 60) / 2;
    const rightCol = left + colWidth + 20;
    const topY = b.y + 80;

    // Make sure activeHub is one we actually own (a hub may have been removed
    // somehow, or this is a legacy save).
    if (!me.hubs.includes(state.activeHub)) {
      state.activeHub = me.hubs[0];
    }
    const activeCity = getCity(state.activeHub);

    // -- Hub picker row: one chip per owned hub. Click to switch active hub. --
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
    // Hint when only one hub: tell the user how to add more.
    if (me.hubs.length === 1) {
      this.addText(hx + 4, topY - 6, '— click a city in the Control Tower map to buy a new hub.', 11, COLORS.textDim);
    }
    // Avoid lint about unused variable when only one hub is owned.
    void hubLabel;

    // LEFT: open new routes from active hub
    this.addText(left, topY + 38, `New Routes from ${activeCity.name}`, 16, COLORS.accentText);
    let y = topY + 68;
    this.addText(left,       y, 'Destination', 12, COLORS.textDim);
    this.addText(left + 200, y, 'Distance',    12, COLORS.textDim);
    this.addText(left + 290, y, 'Suggested $', 12, COLORS.textDim);
    y += 20;

    for (const dest of CITIES) {
      if (dest.id === activeCity.id) continue;
      const already = me.routes.some(r =>
        (r.fromCity === activeCity.id && r.toCity === dest.id) ||
        (r.fromCity === dest.id && r.toCity === activeCity.id)
      );
      const dist = distanceKm(activeCity, dest);
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
    this.addText(rightCol, topY + 38, `Your Routes from ${activeCity.name}`, 16, COLORS.accentText);
    y = topY + 68;

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
      this.addText(rightCol + 80,  y, formatMoney(route.ticketPrice), 13);
      this.addText(rightCol + 200, y, `Load factor: ${Math.round(lf * 100)}%`, 12, COLORS.textDim);

      // Price adjusters
      const minus = new Button({
        scene: this, x: rightCol + 360, y: y + 6, width: 28, height: 22, label: '−',
        onClick: () => { route.ticketPrice = Math.max(20, route.ticketPrice - 10); this.rebuild(); },
      });
      const plus = new Button({
        scene: this, x: rightCol + 392, y: y + 6, width: 28, height: 22, label: '+',
        onClick: () => { route.ticketPrice = route.ticketPrice + 10; this.rebuild(); },
      });
      this.content.add(minus); this.content.add(plus);
      y += 22;

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
    if (rivals.length > 0) {
      const cheaper = rivals.filter(r => r.ticketPrice < route.ticketPrice).length;
      lines.push(`Competition: ${rivals.length} rival route(s) on this pair, ${cheaper} cheaper than you`);
    } else {
      lines.push(`Competition: none — full demand`);
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
