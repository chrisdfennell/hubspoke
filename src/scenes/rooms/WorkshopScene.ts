import { GameState } from '../../state/GameState';
import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { formatMoney } from '../../systems/Clock';
import { PLANE_MODELS, PlaneModel, getCity } from '../../state/catalog';
import { Plane } from '../../state/Plane';
import { getFuelPrice } from '../../systems/Economy';
import { sound } from '../../systems/Sound';
import { getCEO } from '../../state/ceos';
import { UPGRADES, UpgradeCategory, getUpgrade } from '../../state/upgrades';
import { makePlaneIcon } from '../../ui/PlaneIcon';
import { liveryAccent } from '../../state/upgrades';
import { sellPlane, buyUsedPlane, sellPriceFor, UsedPlaneListing, LISTING_DAYS } from '../../systems/UsedMarket';
import { dateToDay } from '../../state/demandModifiers';

/** Threshold above which buying a plane prompts a confirmation modal —
 *  a B747 / A380 misclick is real money down the drain otherwise. */
const BIG_PURCHASE_THRESHOLD = 50_000_000;

type WorkshopTab = 'buy' | 'used' | 'fleet';

export class WorkshopScene extends RoomScene {
  /** When set, the Workshop renders a focused "Outfit" view for that
   *  plane instead of the buy table + fleet list. Cleared by the Back
   *  button in the outfit view, and reset on every fresh scene entry
   *  (Phaser reuses instances) so leaving + re-entering always lands
   *  on the default view. */
  private outfitPlaneId: string | null = null;

  /** Persisted across rebuild() calls within one scene visit so clicking
   *  Repair / Sell / Buy doesn't bounce you back to the Buy tab. Reset
   *  in create() so re-entering the scene always lands on Buy. */
  private currentTab: WorkshopTab = 'buy';

  constructor() { super('WorkshopScene'); this.title = 'Workshop'; }

  create() {
    this.outfitPlaneId = null;
    this.currentTab = 'buy';
    super.create();
  }

  buildRoom() {
    if (this.outfitPlaneId) {
      this.buildOutfitView();
      return;
    }
    this.buildTabbedView();
  }

  /** Header (cash) + tab picker + selected-tab body. Replaces the old
   *  single-page layout that stacked all three sections vertically. */
  private buildTabbedView() {
    const state = GameState.get();
    const me = state.human;
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y, `Cash: ${formatMoney(me.cash)}`, 16, me.cash < 0 ? '#ff7b88' : COLORS.accentText);
    y += 32;

    this.buildTabPicker(left, y);
    y += 40;

    if (this.currentTab === 'buy') this.buildBuyTab(left, y);
    else if (this.currentTab === 'used') this.buildUsedTab(left, y);
    else this.buildFleetTab(left, y);
  }

  private buildTabPicker(left: number, topY: number) {
    const state = GameState.get();
    const tabs: Array<{ id: WorkshopTab; label: string }> = [
      { id: 'buy',   label: 'Buy new' },
      { id: 'used',  label: `Used market (${state.usedPlanes.length})` },
      { id: 'fleet', label: `Your fleet (${state.human.planes.length})` },
    ];
    let tx = left;
    for (const t of tabs) {
      const w = Math.max(120, 16 + t.label.length * 7);
      const isActive = this.currentTab === t.id;
      const btn = new Button({
        scene: this,
        x: tx + w / 2,
        y: topY,
        width: w,
        height: 26,
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

  /** Buy-new-plane table — every PLANE_MODELS entry with class-tinted
   *  silhouette, headline economics, and a Buy button (big-purchase
   *  confirm modal at the BIG_PURCHASE_THRESHOLD). */
  private buildBuyTab(left: number, startY: number) {
    const state = GameState.get();
    const me = state.human;
    let y = startY;

    // Column headers — shifted right by the silhouette column width.
    const ICON_COL = 50;
    this.addText(left + ICON_COL,       y, 'Model',    12, COLORS.textDim);
    this.addText(left + ICON_COL + 240, y, 'Seats',    12, COLORS.textDim);
    this.addText(left + ICON_COL + 310, y, 'Range',    12, COLORS.textDim);
    this.addText(left + ICON_COL + 400, y, 'Speed',    12, COLORS.textDim);
    this.addText(left + ICON_COL + 490, y, 'Fuel/km',  12, COLORS.textDim);
    this.addText(left + ICON_COL + 580, y, 'Price',    12, COLORS.textDim);
    y += 22;

    for (const m of PLANE_MODELS) {
      // Class-differentiated silhouette in the player's airline color,
      // so the buy list shows visual variety instead of being pure text.
      // Centered in a 50-px column at the row's left.
      const icon = makePlaneIcon(
        this, left + 22, y + 16, m.seats, me.color, 0, m.cls, /* shadow */ false,
      );
      this.content.add(icon);

      const nameTxt   = this.addText(left + ICON_COL,       y + 6, m.name, 13);
      const seatsTxt  = this.addText(
        left + ICON_COL + 240, y + 6,
        m.seats > 0 ? `${m.seats}` : 'freighter',
        13,
        m.seats > 0 ? COLORS.text : '#caa46a',
      );
      const rangeTxt  = this.addText(left + ICON_COL + 310, y + 6, `${m.range} km`, 13);
      const speedTxt  = this.addText(left + ICON_COL + 400, y + 6, `${m.speed} km/h`, 13);
      const fuelTxt   = this.addText(left + ICON_COL + 490, y + 6, `${m.fuelPerKm.toFixed(1)} L`, 13);
      const priceTxt  = this.addText(left + ICON_COL + 580, y + 6, formatMoney(m.price), 13);
      const tip = () => this.modelTooltip(m);
      [nameTxt, seatsTxt, rangeTxt, speedTxt, fuelTxt, priceTxt].forEach(t => this.tooltip.attach(t, tip));

      const canAfford = me.cash >= m.price;
      const doBuy = () => {
        if (me.cash < m.price) return;
        me.cash -= m.price;
        // Park the new plane at the hub the player is currently focused on,
        // not the global default — fixes a multi-hub bug where a London-
        // operator buying a plane would find it sitting in Honolulu.
        const home = state.activeHub;
        const plane = new Plane(m.id, home);
        me.planes.push(plane);
        state.stats.planesBought++;
        state.pushNews(`${me.name} purchased a ${m.name} (${plane.name}) at ${getCity(home).name}.`);
        sound.play('buy');
        this.rebuild();
      };
      const btn = new Button({
        scene: this,
        x: left + ICON_COL + 760,
        y: y + 14,
        width: 110,
        height: 28,
        label: canAfford ? 'Buy' : 'Too expensive',
        onClick: () => {
          if (me.cash < m.price) return;
          // Confirm modal for big purchases — a B747 misclick is $240M down
          // the drain otherwise. Cheaper planes (Cessna, ATR) skip the
          // confirm so the early game doesn't feel naggy.
          if (m.price >= BIG_PURCHASE_THRESHOLD) {
            Modal.confirm(this, {
              title: 'Confirm purchase',
              message: `Buy a ${m.name} for ${formatMoney(m.price)}?\nCash after purchase: ${formatMoney(me.cash - m.price)}.`,
              confirmLabel: 'Buy',
              cancelLabel: 'Cancel',
              onConfirm: doBuy,
            });
          } else {
            doBuy();
          }
        },
        disabled: !canAfford,
      });
      this.content.add(btn);

      y += 36;
    }
  }

  /** Used-plane market tab — silhouettes, condition, source, ask, days
   *  left, and a Buy button per listing. */
  private buildUsedTab(left: number, startY: number) {
    const state = GameState.get();
    const me = state.human;
    let y = startY;

    this.addText(left, y,
      `Listings expire after ${LISTING_DAYS} days. Buying a used plane adds it to your active hub — you cover the repair.`,
      12, COLORS.textDim);
    y += 26;

    if (state.usedPlanes.length === 0) {
      this.addText(left, y, 'No used planes available right now. Check back tomorrow.', 13, COLORS.textDim);
      return;
    }

    this.addText(left + 50,  y, 'Model',     12, COLORS.textDim);
    this.addText(left + 290, y, 'Condition', 12, COLORS.textDim);
    this.addText(left + 390, y, 'Source',    12, COLORS.textDim);
    this.addText(left + 510, y, 'Ask',       12, COLORS.textDim);
    this.addText(left + 620, y, 'Listed',    12, COLORS.textDim);
    y += 20;
    const today = dateToDay(state.date);
    for (const listing of state.usedPlanes) {
      this.renderUsedRow(listing, left, y, me, today);
      y += 30;
    }
  }

  /** Fleet tab — one row per owned plane with Repair / Outfit / Rename /
   *  Sell. The Outfit button drops into the existing single-plane outfit
   *  view; everything else rebuilds in place. */
  private buildFleetTab(left: number, startY: number) {
    const state = GameState.get();
    const me = state.human;
    let y = startY;

    if (me.planes.length === 0) {
      this.addText(left, y, 'No planes owned. Switch to "Buy new" or "Used market" to get started.', 13, COLORS.textDim);
      return;
    }
    this.addText(left,       y, 'Name',   12, COLORS.textDim);
    this.addText(left + 280, y, 'Model',  12, COLORS.textDim);
    this.addText(left + 500, y, 'Cond',   12, COLORS.textDim);
    y += 20;
    for (const plane of me.planes) {
      this.addText(left,       y + 6, plane.name, 13);
      this.addText(left + 280, y + 6, plane.model.name, 13);
      this.addText(left + 500, y + 6, `${Math.round(plane.condition * 100)}%`, 13, plane.condition < 0.5 ? '#ff7b88' : COLORS.text);

      // 2% of plane price per condition point — a brand-new plane down to 50%
      // condition costs ~1% of the plane's price to fully restore, on top of
      // amortized daily maintenance. Igor's CEO perk halves this.
      const ceo = getCEO(me.ceoId);
      const repairMult = ceo?.perks.repairCostMult ?? 1.0;
      const repairCost = Math.round((1 - plane.condition) * plane.model.price * 0.01 * repairMult);
      const needsWork = plane.condition < 0.99;
      const canPay = me.cash >= repairCost;
      const repairBtn = new Button({
        scene: this,
        x: left + 620,
        y: y + 14,
        width: 130,
        height: 28,
        label: needsWork ? `Repair  ${formatMoney(repairCost)}` : 'Pristine',
        onClick: () => {
          if (!needsWork || me.cash < repairCost) return;
          me.cash -= repairCost;
          plane.condition = 1.0;
          this.rebuild();
        },
        disabled: !needsWork || !canPay,
      });
      this.content.add(repairBtn);

      const outfitBtn = new Button({
        scene: this,
        x: left + 770,
        y: y + 14,
        width: 90,
        height: 28,
        label: 'Outfit',
        onClick: () => {
          this.outfitPlaneId = plane.id;
          this.scrollTo(0);
          this.rebuild();
        },
      });
      this.content.add(outfitBtn);

      const renameBtn = new Button({
        scene: this,
        x: left + 870,
        y: y + 14,
        width: 80,
        height: 28,
        label: 'Rename',
        onClick: () => {
          Modal.prompt(this, {
            title: 'Rename plane',
            message: `New name for ${plane.name}:`,
            default: plane.name,
            minLen: 1,
            maxLen: 32,
            onSubmit: (next) => {
              plane.name = next;
              this.rebuild();
            },
          });
        },
      });
      this.content.add(renameBtn);

      // Sell — only valid for idle planes. Mid-flight or in-maintenance
      // gets greyed out with the same explanation as the Cargo dispatch.
      const isIdle = plane.status.kind === 'idle';
      const salePrice = sellPriceFor(plane);
      const sellBtn = new Button({
        scene: this,
        x: left + 960,
        y: y + 14,
        width: 80,
        height: 28,
        label: isIdle ? `Sell ${formatMoney(salePrice)}` : 'Busy',
        disabled: !isIdle,
        onClick: () => {
          if (!isIdle) return;
          const lostUpgrades = Object.keys(plane.upgrades).length > 0;
          const warningLine = lostUpgrades
            ? '\nUpgrades on this plane will be lost.'
            : '';
          Modal.confirm(this, {
            title: 'Sell plane',
            message: `Sell ${plane.name} (${plane.model.name}, ${Math.round(plane.condition * 100)}% condition) for ${formatMoney(salePrice)}?${warningLine}`,
            confirmLabel: 'Sell',
            cancelLabel: 'Keep',
            onConfirm: () => {
              const result = sellPlane(me, plane.id);
              if (result.ok) {
                state.pushNews(`${me.name} sold ${plane.name} for ${formatMoney(result.price)}.`);
                sound.play('buy');
                this.rebuild();
              }
            },
          });
        },
      });
      this.content.add(sellBtn);
      y += 36;
    }
  }

  /** One row of the used-plane market — silhouette, condition bar,
   *  source label, ask price, days listed, and a Buy button (disabled
   *  if the player can't afford it). */
  private renderUsedRow(listing: UsedPlaneListing, left: number, y: number, me: ReturnType<typeof GameState.get>['human'], today: number) {
    const state = GameState.get();
    const model = PLANE_MODELS.find(m => m.id === listing.modelId)!;
    const daysListed = today - listing.listedOnDay;
    const daysLeft = LISTING_DAYS - daysListed;
    const dayColor = daysLeft <= 5 ? '#ff9aa6' : COLORS.textDim;

    const icon = makePlaneIcon(this, left + 22, y + 14, model.seats, me.color, 0, model.cls, /* shadow */ false);
    this.content.add(icon);

    this.addText(left + 50,  y + 4, model.name, 13);
    this.addText(left + 290, y + 4,
      `${Math.round(listing.condition * 100)}%`,
      13,
      listing.condition < 0.5 ? '#ff9aa6' : '#caa46a',
    );
    this.addText(left + 390, y + 4, listing.sourceLabel, 12, COLORS.textDim);
    this.addText(left + 510, y + 4, formatMoney(listing.askPrice), 13);
    this.addText(left + 620, y + 4, `${daysLeft}d left`, 12, dayColor);

    const canAfford = me.cash >= listing.askPrice;
    const btn = new Button({
      scene: this,
      x: left + 760, y: y + 14, width: 110, height: 28,
      label: canAfford ? 'Buy used' : 'Too expensive',
      disabled: !canAfford,
      onClick: () => {
        if (!canAfford) return;
        const doBuy = () => {
          const result = buyUsedPlane(me, listing.id, state.activeHub);
          if (result.ok) {
            state.pushNews(`${me.name} bought a used ${model.name} for ${formatMoney(listing.askPrice)} (${Math.round(listing.condition * 100)}% condition).`);
            state.stats.planesBought++;
            sound.play('buy');
            this.rebuild();
          }
        };
        // Re-use the new-plane big-purchase guardrail so a $100M used 747
        // misclick still asks before draining the bank.
        if (listing.askPrice >= BIG_PURCHASE_THRESHOLD) {
          Modal.confirm(this, {
            title: 'Confirm used purchase',
            message: `Buy used ${model.name} (${Math.round(listing.condition * 100)}% condition) for ${formatMoney(listing.askPrice)}?\nRepair cost to bring to full condition: ${formatMoney(Math.round((1 - listing.condition) * model.price * 0.01))}.`,
            confirmLabel: 'Buy',
            cancelLabel: 'Cancel',
            onConfirm: doBuy,
          });
        } else {
          doBuy();
        }
      },
    });
    this.content.add(btn);
  }

  /** Focused detail view for a single plane — three upgrade-category
   *  panels showing the currently-equipped option (if any) and every
   *  available upgrade with its price. Buying replaces the previously
   *  equipped upgrade in that category. */
  private buildOutfitView() {
    const state = GameState.get();
    const me = state.human;
    const plane = me.planes.find(p => p.id === this.outfitPlaneId);
    if (!plane) {
      // Plane was sold / crashed while in this view — bounce back to
      // the Fleet tab so the player sees their remaining roster.
      this.outfitPlaneId = null;
      this.currentTab = 'fleet';
      this.buildTabbedView();
      return;
    }
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    const backBtn = new Button({
      scene: this,
      x: left + 50, y, width: 110, height: 28,
      label: '← Back',
      onClick: () => {
        this.outfitPlaneId = null;
        this.scrollTo(0);
        this.rebuild();
      },
    });
    this.content.add(backBtn);
    this.addText(left + 130, y - 8, `Outfitting ${plane.name}  ·  ${plane.model.name}`, 16, COLORS.accentText);
    this.addText(left + 130, y + 14,
      `Cash: ${formatMoney(me.cash)}  ·  one upgrade per category. Buying replaces the current one.`,
      12, COLORS.textDim);

    // Live preview silhouette in the top-right of the outfit panel. The
    // tail picks up the equipped livery's accentColor; hovering any livery
    // row below previews that livery's accent without committing the buy.
    const previewX = b.x + b.w - 80;
    const previewY = y + 30;
    this.addText(previewX - 30, previewY + 30, 'Preview', 11, COLORS.textDim);
    let previewSilhouette: Phaser.GameObjects.Graphics | null = null;
    const rebuildPreview = (override?: number) => {
      if (previewSilhouette) previewSilhouette.destroy();
      const accent = override !== undefined ? override : liveryAccent(plane.upgrades);
      previewSilhouette = makePlaneIcon(
        this, previewX, previewY, plane.model.seats, me.color, 0, plane.model.cls,
        /* shadow */ false, accent,
      );
      previewSilhouette.setScale(2);
      this.content.add(previewSilhouette);
    };
    rebuildPreview();

    y += 56;

    const categories: Array<{ id: UpgradeCategory; label: string; tagline: string }> = [
      { id: 'livery',        label: 'Livery',         tagline: 'Cosmetic — small reputation drip per successful arrival.' },
      { id: 'interior',      label: 'Interior',       tagline: 'Seating — multiplicative bonus to load factor.' },
      { id: 'entertainment', label: 'Entertainment',  tagline: 'In-flight services — additional load-factor bump.' },
    ];

    for (const cat of categories) {
      const equippedId = plane.upgrades[cat.id];
      const equipped = equippedId ? getUpgrade(equippedId) : undefined;
      this.addText(left, y, cat.label, 16, COLORS.accentText);
      this.addText(left + 110, y + 4, cat.tagline, 11, COLORS.textDim);
      this.addText(left, y + 22, `Equipped: ${equipped ? equipped.name : '— none —'}`,
        13, equipped ? '#ffc857' : COLORS.textDim);
      if (equipped) {
        const removeBtn = new Button({
          scene: this,
          x: left + 380, y: y + 28, width: 110, height: 24,
          label: 'Remove',
          onClick: () => {
            delete plane.upgrades[cat.id];
            this.rebuild();
          },
        });
        this.content.add(removeBtn);
      }
      y += 50;

      for (const u of UPGRADES.filter(u => u.category === cat.id)) {
        const isEquipped = u.id === equippedId;
        const canAfford = me.cash >= u.price;

        // For livery rows, lay a transparent interactive rect underneath
        // the text so hovering anywhere on the row previews that livery's
        // accent on the silhouette above. Other categories don't change
        // the silhouette so they skip this.
        if (cat.id === 'livery' && u.accentColor !== undefined) {
          const hover = this.add.rectangle(left + 500, y + 10, 980, 22, 0x000000, 0)
            .setOrigin(0.5)
            .setInteractive();
          const accent = u.accentColor;
          hover.on('pointerover', () => rebuildPreview(accent));
          hover.on('pointerout',  () => rebuildPreview());
          this.content.add(hover);
        }

        this.addText(left + 16, y, u.name, 13, isEquipped ? '#7be08a' : COLORS.text);
        this.addText(left + 200, y, formatMoney(u.price), 12, canAfford ? COLORS.text : '#ff9aa6');
        if (u.loadFactorBonus) {
          this.addText(left + 300, y, `+${Math.round(u.loadFactorBonus * 100)}% LF`, 12, COLORS.textDim);
        }
        if (u.reputationPerFlight) {
          this.addText(left + 380, y, `+${u.reputationPerFlight.toFixed(2)} rep/flight`, 12, COLORS.textDim);
        }
        this.addText(left + 540, y + 2, u.description, 11, COLORS.textDim);

        const btn = new Button({
          scene: this,
          x: left + 900, y: y + 8, width: 110, height: 22,
          label: isEquipped ? '✓ Installed' : (canAfford ? 'Install' : 'Too expensive'),
          onClick: () => {
            if (isEquipped) return;
            if (me.cash < u.price) return;
            me.cash -= u.price;
            plane.upgrades[cat.id] = u.id;
            sound.play('buy');
            this.rebuild();
          },
          disabled: isEquipped || !canAfford,
        });
        this.content.add(btn);
        y += 24;
      }
      y += 22;
    }
    this.reportContentBottom(y);
  }

  /** Per-model economics tooltip — fuel cost per km, break-even passengers, $/seat. */
  private modelTooltip(m: PlaneModel): string {
    const fuel = getFuelPrice();
    const fuelPerKm = m.fuelPerKm * fuel;          // $ per km
    // Round-trip fuel cost on a 1000 km route.
    const sample1000 = 2 * 1000 * m.fuelPerKm * fuel;
    // Daily maintenance bill (24h × per-hour).
    const dailyMaint = m.maintenancePerHour * 24;
    // Freighters have seats: 0 — show $/kg capacity instead of $/seat.
    const isFreighter = m.seats === 0;
    const capitalLine = isFreighter
      ? `Capital: ${formatMoney(m.price)}  ($${(m.price / m.cargoCapacityKg).toFixed(0)} per kg of capacity)`
      : `Capital: ${formatMoney(m.price)}  (${formatMoney(m.price / m.seats)} per seat)`;

    return [
      `${m.manufacturer} ${m.name}${isFreighter ? '  (FREIGHTER)' : ''}`,
      capitalLine,
      `Cargo capacity: ${m.cargoCapacityKg.toLocaleString('en-US')} kg`,
      `Range: ${m.range} km   ·   Cruise: ${m.speed} km/h`,
      `Fuel @ $${fuel.toFixed(2)}/L:  $${fuelPerKm.toFixed(2)} per km`,
      `1,000 km round-trip fuel:  ${formatMoney(sample1000)}`,
      `Daily maintenance:  ${formatMoney(dailyMaint)}`,
    ].join('\n');
  }
}
