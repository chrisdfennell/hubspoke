import { Player, PlayerSnapshot } from './Player';
import { Plane } from './Plane';
import { Route } from './Route';
import { DEFAULT_AIRLINES, HOME_AIRPORT, CITIES, getCity, getPlaneModel } from './catalog';
import { CEOS, getCEO, DEFAULT_CEO_ID } from './ceos';
import { getFuelPrice, setFuelPrice } from '../systems/Economy';
import { GameEvent } from '../systems/Events';
import { snapshotModifiers, restoreModifiers } from './demandModifiers';
import { CargoContract, getContractCounter, setContractCounter } from '../systems/Cargo';
import { CharterContract } from './Charter';
import { getCharterCounter, setCharterCounter } from '../systems/Charters';
import { UsedPlaneListing, getUsedListingCounter, setUsedListingCounter } from '../systems/UsedMarket';
import { SponsorContract } from './Sponsor';
import { Contact, getLoungeCounter, setLoungeCounter } from '../systems/Lounge';
import { Difficulty, getDifficulty } from './Difficulty';

export interface GameDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-30 (simplified)
  hour: number;  // 0-23
  minute: number;// 0-59
}

/** Player-tweakable gameplay settings. Persisted with the save so each game
 *  remembers its own preferences. */
export interface GameSettings {
  /** Don't dispatch a flight whose estimated profit would be negative. */
  skipUnprofitable: boolean;
  /** Don't dispatch a flight whose expected load factor is below this fraction (0..0.95). */
  minLoadFactorForTakeoff: number;
  /** Auto-pause the game whenever a room is entered. */
  pauseOnRoomEntry: boolean;
  /** News-ticker category toggles. Milestones (★) always show regardless —
   *  they're rare and gameplay-significant. */
  showMineNews: boolean;
  showRivalNews: boolean;
  showEventNews: boolean;
  /** How often the game writes to the active save slot. 'manual' disables
   *  the timer; the player still gets saves from the in-app Save button. */
  autosaveCadence: 'hour' | 'day' | 'manual';
  /** Save to the active slot when the browser tab closes / refreshes. */
  saveOnClose: boolean;
  /** Demand-event impact dial. 'off' suppresses event rolls entirely;
   *  'mild'/'harsh' scale demand multipliers, reputation deltas, and plane
   *  condition damage by 0.5× / 1.5× around their nominal values. */
  eventSeverity: 'off' | 'mild' | 'normal' | 'harsh';
  /** Auto-repair planes that drop below this condition (0..1). 0 = off.
   *  A daily hook charges the workshop repair cost when threshold is hit. */
  autoRepairThreshold: number;
  /** When false, route tooltips hide rival pricing entirely — you fly blind
   *  against the competition. */
  showCompetitorPrices: boolean;
  /** When true, a paper-styled weekly summary pops every 7 in-game days
   *  with headlines, the week's stats, and passenger letters. */
  showWeeklyPaper: boolean;
  /** When true, random intervention events fire roughly weekly with
   *  modal choice prompts (engine flag, pilots' raise, charter offer,
   *  etc.). Disable for a quieter run. */
  showInterventions: boolean;
  /** When true, the game loop + music keep running while the browser
   *  tab is hidden or in the background. Off (default) matches typical
   *  browser-game behavior: tab away and the world pauses + music stops. */
  runInBackground: boolean;
  /** When true, buying a new plane auto-hires a pilot + mechanic if the
   *  fleet would otherwise be understaffed. Hire cost is charged to
   *  cash, same as a manual hire. */
  autoHireCrew: boolean;
  /** Amplitude of the daily fuel-price drift. Off freezes fuel-price
   *  entirely (mean-reversion still applies as a one-time pull); low /
   *  normal / high scale the daily noise. */
  fuelVolatility: 'off' | 'low' | 'normal' | 'high';
  /** Confirmation modal threshold for plane purchases. 'never' suppresses
   *  the confirm entirely; otherwise the modal fires for purchases at or
   *  above the chosen $ threshold. */
  confirmPurchaseAt: 'never' | '10m' | '50m' | '100m';
}

export const DEFAULT_SETTINGS: GameSettings = {
  skipUnprofitable: false,
  minLoadFactorForTakeoff: 0,
  pauseOnRoomEntry: false,
  showMineNews: true,
  showRivalNews: true,
  showEventNews: true,
  autosaveCadence: 'hour',
  saveOnClose: true,
  eventSeverity: 'normal',
  autoRepairThreshold: 0,
  showCompetitorPrices: true,
  showWeeklyPaper: true,
  showInterventions: true,
  runInBackground: false,
  autoHireCrew: false,
  fuelVolatility: 'normal',
  confirmPurchaseAt: '50m',
};

/** Bump when a backwards-incompatible balance change ships. The migrator in
 *  Economy.migrateBalance() reads this to decide whether to rewrite legacy data. */
export const CURRENT_BALANCE_VERSION = 3;

/** Career stats for the human player. Read live in the Stats panel and on
 *  game-over; recorded cumulatively across the run by the systems that
 *  generate the underlying events (Flights, TravelAgencyScene, etc). */
export interface GameStats {
  flights: number;
  passengers: number;
  km: number;
  revenue: number;
  fuel: number;
  /** Best single-flight profit (most positive). */
  bestFlightProfit: number;
  /** Worst single-flight result (most negative — biggest loss). */
  worstFlightLoss: number;
  crashes: number;
  incidents: number;
  routesOpened: number;
  planesBought: number;
  hubsBought: number;
  daysPlayed: number;
  peakNetWorth: number;
  /** Cumulative cargo deliveries (successful only). */
  cargoDeliveries: number;
  /** Lifetime kg shipped via cargo contracts. */
  cargoKgShipped: number;
  /** Highest single cargo payment cleared. */
  cargoBiggestPayment: number;
  /** Cumulative charter deliveries. */
  charterDeliveries: number;
  /** Lifetime passengers carried on charters. */
  charterPaxFlown: number;
  /** Largest single charter (passengers) completed. */
  charterBiggestGroup: number;
}

export const DEFAULT_STATS: GameStats = {
  flights: 0,
  passengers: 0,
  km: 0,
  revenue: 0,
  fuel: 0,
  bestFlightProfit: 0,
  worstFlightLoss: 0,
  crashes: 0,
  incidents: 0,
  routesOpened: 0,
  planesBought: 0,
  hubsBought: 0,
  daysPlayed: 0,
  peakNetWorth: 0,
  cargoDeliveries: 0,
  cargoKgShipped: 0,
  cargoBiggestPayment: 0,
  charterDeliveries: 0,
  charterPaxFlown: 0,
  charterBiggestGroup: 0,
};

export interface GameSnapshot {
  version: number;
  date: GameDate;
  paused: boolean;
  speed: 1 | 2 | 4;
  humanIndex: number;
  players: PlayerSnapshot[];
  news: { date: GameDate; text: string }[];
  fuelPrice: number;
  /** Stock prices per airline at time of save. */
  stockPrices: Record<string, number>;
  /** Total shares outstanding per airline. Grows on IPO, shrinks on
   *  buyback. Optional for back-compat with pre-IPO saves — loadFrom
   *  defaults missing entries to 1,000,000 (the legacy flat float). */
  sharesOutstanding?: Record<string, number>;
  /** Highest takeover-warning tier already announced per (target,acquirer)
   *  pair, keyed by "${targetId}|${acquirerId}". Prevents the news ticker
   *  from re-firing every day while ownership sits in a tier. */
  takeoverAlerts?: Record<string, number>;
  /** Used-plane market listings (player trade-ins + synthetic refresh). */
  usedPlanes?: UsedPlaneListing[];
  /** Counter so freshly-minted listings don't collide on load. */
  usedListingCounter?: number;
  /** Recent random events (newest first). */
  gameEvents: GameEvent[];
  /** Active per-city demand modifiers. */
  demandModifiers: Record<string, { mult: number; expiresOn: number }[]>;
  /** Player id who has been forced into receivership/takeover, or null. */
  takenOverBy: Record<string, string>;
  /** Cargo state. */
  cargoOffers: CargoContract[];
  cargoActive: CargoContract[];
  cargoCompleted: CargoContract[];
  cargoCounter: number;
  /** Charter state — passenger-bulk contracts, premium over fair fare. */
  charterOffers?: CharterContract[];
  charterActive?: CharterContract[];
  charterCompleted?: CharterContract[];
  charterCounter?: number;
  /** Sponsor contracts: available offers, accepted/in-progress, and history. */
  sponsorOffers?: SponsorContract[];
  sponsorActive?: SponsorContract[];
  sponsorCompleted?: SponsorContract[];
  loungeContacts: Contact[];
  loungeCounter: number;
  /** Difficulty preset for this run. */
  difficulty: Difficulty;
  /** Player-tweakable gameplay options. Optional for backwards-compat. */
  settings?: GameSettings;
  /** Tracks which balance migrations have been applied to this save.
   *  Optional for backwards-compat with pre-migration saves. */
  balanceVersion?: number;
  /** City id of the human's currently-focused hub (Travel Agency, AirportScene
   *  title). Optional for backwards-compat. */
  activeHub?: string;
  /** Net-worth milestones the human has already crossed. Legacy save field —
   *  newer saves write `achievementsUnlocked` instead; loadFrom falls back
   *  to this when the new field is missing. */
  milestonesReached?: string[];
  /** Every achievement id the human has unlocked (wealth tiers + others). */
  achievementsUnlocked?: string[];
  /** Career stats. Optional for backwards-compat with pre-stats saves. */
  stats?: GameStats;
}

export const SAVE_VERSION = 1;

export class GameState {
  /** All airlines, including AI rivals. Index 0 is the local human player. */
  players: Player[] = [];
  /** Index into players[] of the local human. */
  humanIndex = 0;
  /** Game-world clock. Driven by Clock system. */
  date: GameDate = { year: 2026, month: 1, day: 1, hour: 8, minute: 0 };
  /** Paused flag — gameplay loops should respect this. */
  paused = false;
  /** Speed multiplier (1, 2, 4). */
  speed: 1 | 2 | 4 = 1;
  /** Global news feed for ticker / news room. */
  news: { date: GameDate; text: string }[] = [];
  /** Current share price per airline id ($). */
  stockPrices: Record<string, number> = {};
  /** Total shares outstanding per airline id. Each airline starts at 1M;
   *  IPO mints new shares (issuer gets cash, count goes up), buybacks
   *  retire shares (issuer pays cash, count goes down). */
  sharesOutstanding: Record<string, number> = {};
  /** Highest tier (25 / 40) of a takeover early-warning already announced
   *  for each (target, acquirer) pair. Key = "${targetId}|${acquirerId}". */
  takeoverAlerts: Record<string, number> = {};
  /** Used-plane market: listings available to buy (both player trade-ins
   *  and synthetic refresh entries). Bounded by the daily refresh hook. */
  usedPlanes: UsedPlaneListing[] = [];
  /** Structured events log. Newest first. */
  gameEvents: GameEvent[] = [];
  /** Map of (acquired airline id → acquirer airline id) once a takeover happens. */
  takenOverBy: Record<string, string> = {};
  /** Cargo contracts available to accept. */
  cargoOffers: CargoContract[] = [];
  /** Active (accepted, not yet delivered/failed) cargo contracts. */
  cargoActive: CargoContract[] = [];
  /** Recently delivered or failed cargo contracts. */
  cargoCompleted: CargoContract[] = [];
  /** Passenger-charter contracts available to accept. */
  charterOffers: CharterContract[] = [];
  /** Active charter contracts (accepted, not yet delivered/failed). */
  charterActive: CharterContract[] = [];
  /** Recently delivered or failed charter contracts. */
  charterCompleted: CharterContract[] = [];
  /** Sponsor contracts available to accept. Optional in snapshot for save-compat. */
  sponsorOffers: SponsorContract[] = [];
  /** Sponsor contracts accepted by the human, in progress. */
  sponsorActive: SponsorContract[] = [];
  /** Recently completed / failed / expired sponsor contracts (history). */
  sponsorCompleted: SponsorContract[] = [];
  /** VIP lounge contacts available today. */
  loungeContacts: Contact[] = [];
  /** Difficulty preset for this run. */
  difficulty: Difficulty = 'normal';
  /** Player-tweakable gameplay options. */
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  /** Highest balance migration that has been applied to this state. */
  balanceVersion = 0;
  /** City id of the human's currently-focused hub. Travel Agency uses this as
   *  "where am I opening routes from"; AirportScene shows it in the title. */
  activeHub: string = HOME_AIRPORT;
  /** Ids of achievements the human has unlocked (wealth tiers + everything
   *  else in the registry). Tracked so each unlock fires its news entry
   *  exactly once. Pre-rename saves use `milestonesReached`; loadFrom falls
   *  back to that when this field is absent. */
  achievementsUnlocked: string[] = [];

  /** Career stats for the human. Updated cumulatively by Flights and the
   *  room scenes; rendered in the Stats panel + game-over screen. */
  stats: GameStats = { ...DEFAULT_STATS };

  static instance: GameState | null = null;

  static get(): GameState {
    if (!GameState.instance) {
      GameState.instance = new GameState();
      GameState.instance.bootstrap();
    }
    return GameState.instance;
  }

  /** Reset to a fresh new game. CEO id is applied to the human player as
   *  part of bootstrap so perks (starting cash bonus, starting inventory,
   *  etc.) land before any system hooks fire. `customHub` lets the player
   *  pick where they're based — AI rivals get randomized hubs around it. */
  static reset(
    difficulty: Difficulty = 'normal',
    ceoId?: string,
    customAirline?: { name: string; color: number },
    customHub?: string,
  ): GameState {
    GameState.instance = new GameState();
    GameState.instance.difficulty = difficulty;
    GameState.instance.bootstrap(ceoId, customAirline, customHub);
    return GameState.instance;
  }

  /** Replace the singleton with one restored from a snapshot. */
  static loadFrom(snap: GameSnapshot): GameState {
    const s = new GameState();
    s.date = snap.date;
    s.paused = snap.paused;
    s.speed = snap.speed;
    s.humanIndex = snap.humanIndex;
    s.players = snap.players.map(Player.fromJSON);
    s.news = snap.news;
    s.stockPrices = snap.stockPrices ?? {};
    // Pre-IPO saves don't carry sharesOutstanding — backfill to 1M per
    // known airline so the legacy fixed-float math stays consistent.
    s.sharesOutstanding = { ...(snap.sharesOutstanding ?? {}) };
    for (const id of Object.keys(s.stockPrices)) {
      if (s.sharesOutstanding[id] === undefined) s.sharesOutstanding[id] = 1_000_000;
    }
    s.takeoverAlerts = { ...(snap.takeoverAlerts ?? {}) };
    s.usedPlanes = snap.usedPlanes ?? [];
    if (typeof snap.usedListingCounter === 'number') setUsedListingCounter(snap.usedListingCounter);
    s.gameEvents = snap.gameEvents ?? [];
    s.takenOverBy = snap.takenOverBy ?? {};
    s.cargoOffers = snap.cargoOffers ?? [];
    s.cargoActive = snap.cargoActive ?? [];
    s.cargoCompleted = snap.cargoCompleted ?? [];
    if (typeof snap.cargoCounter === 'number') setContractCounter(snap.cargoCounter);
    s.charterOffers = snap.charterOffers ?? [];
    s.charterActive = snap.charterActive ?? [];
    s.charterCompleted = snap.charterCompleted ?? [];
    if (typeof snap.charterCounter === 'number') setCharterCounter(snap.charterCounter);
    s.sponsorOffers = snap.sponsorOffers ?? [];
    s.sponsorActive = snap.sponsorActive ?? [];
    s.sponsorCompleted = snap.sponsorCompleted ?? [];
    s.loungeContacts = snap.loungeContacts ?? [];
    if (typeof snap.loungeCounter === 'number') setLoungeCounter(snap.loungeCounter);
    s.difficulty = snap.difficulty ?? 'normal';
    s.settings = { ...DEFAULT_SETTINGS, ...(snap.settings ?? {}) };
    s.balanceVersion = snap.balanceVersion ?? 0;
    s.activeHub = snap.activeHub ?? HOME_AIRPORT;
    // Achievements: prefer the new field; fall back to the legacy
    // `milestonesReached` so pre-rename saves carry their unlocked wealth
    // tiers across without re-firing them.
    s.achievementsUnlocked = [...(snap.achievementsUnlocked ?? snap.milestonesReached ?? [])];
    s.stats = { ...DEFAULT_STATS, ...(snap.stats ?? {}) };
    restoreModifiers(snap.demandModifiers);
    setFuelPrice(snap.fuelPrice);
    GameState.instance = s;
    return s;
  }

  toJSON(): GameSnapshot {
    return {
      version: SAVE_VERSION,
      date: { ...this.date },
      paused: this.paused,
      speed: this.speed,
      humanIndex: this.humanIndex,
      players: this.players.map(p => p.toJSON()),
      news: this.news,
      fuelPrice: getFuelPrice(),
      stockPrices: { ...this.stockPrices },
      sharesOutstanding: { ...this.sharesOutstanding },
      takeoverAlerts: { ...this.takeoverAlerts },
      usedPlanes: this.usedPlanes,
      usedListingCounter: getUsedListingCounter(),
      gameEvents: this.gameEvents,
      demandModifiers: snapshotModifiers(),
      takenOverBy: { ...this.takenOverBy },
      cargoOffers: this.cargoOffers,
      cargoActive: this.cargoActive,
      cargoCompleted: this.cargoCompleted,
      cargoCounter: getContractCounter(),
      charterOffers: this.charterOffers,
      charterActive: this.charterActive,
      charterCompleted: this.charterCompleted,
      charterCounter: getCharterCounter(),
      sponsorOffers: this.sponsorOffers,
      sponsorActive: this.sponsorActive,
      sponsorCompleted: this.sponsorCompleted,
      loungeContacts: this.loungeContacts,
      loungeCounter: getLoungeCounter(),
      difficulty: this.difficulty,
      settings: { ...this.settings },
      balanceVersion: this.balanceVersion,
      activeHub: this.activeHub,
      achievementsUnlocked: [...this.achievementsUnlocked],
      stats: { ...this.stats },
    };
  }

  get human(): Player {
    return this.players[this.humanIndex];
  }

  findPlayer(id: string): Player | undefined {
    return this.players.find(p => p.id === id);
  }

  findPlane(id: string): { plane: Plane; owner: Player } | undefined {
    for (const p of this.players) {
      const pl = p.planes.find(x => x.id === id);
      if (pl) return { plane: pl, owner: p };
    }
    return undefined;
  }

  findRoute(id: string): { route: Route; owner: Player } | undefined {
    for (const p of this.players) {
      const r = p.routes.find(x => x.id === id);
      if (r) return { route: r, owner: p };
    }
    return undefined;
  }

  pushNews(text: string) {
    this.news.unshift({ date: { ...this.date }, text });
    if (this.news.length > 200) this.news.length = 200;
  }

  private bootstrap(
    ceoId?: string,
    customAirline?: { name: string; color: number },
    customHub?: string,
  ) {
    const cfg = getDifficulty(this.difficulty);
    // Human's hub is either the player's pick or the catalog default
    // (HNL for Honey Air). AI rivals get randomized hubs picked from
    // major-demand cities, distinct from each other AND from the
    // human, so the world never spawns with two airlines sharing a
    // home or with all rivals in HNL.
    const humanHub = customHub && CITIES.some(c => c.id === customHub)
      ? customHub
      : DEFAULT_AIRLINES[0].home;
    const aiCount = DEFAULT_AIRLINES.length - 1;
    const aiHubs = pickRandomAIHubs(humanHub, aiCount);

    DEFAULT_AIRLINES.forEach((a, i) => {
      const isHuman = i === 0;
      // Human-only override — keep AI rivals on their catalog name + color
      // so headlines and the world map still read consistently regardless
      // of what the player named themselves.
      const name  = isHuman && customAirline ? customAirline.name  : a.name;
      const color = isHuman && customAirline ? customAirline.color : a.color;
      const home  = isHuman ? humanHub : aiHubs[i - 1];
      this.players.push(new Player(a.id, name, color, !isHuman, cfg.startCash, home));
    });
    this.humanIndex = 0;
    this.activeHub = this.human.hubs[0];

    // Each airline starts with a single Cessna 208 + difficulty-scaled crew,
    // parked at that airline's own home so AIs spread routes across the map.
    const starterModel = getPlaneModel('cessna-grand-caravan');
    for (const player of this.players) {
      const home = player.hubs[0];
      const plane = new Plane(starterModel.id, home, `${player.name} 1`);
      player.planes.push(plane);
      player.pilots = cfg.startPilots;
      player.mechanics = cfg.startMechanics;
    }

    // Initial share prices and float.
    for (const a of DEFAULT_AIRLINES) {
      this.stockPrices[a.id] = 50;
      this.sharesOutstanding[a.id] = 1_000_000;
    }

    // Assign CEOs and apply starting-cash + starting-inventory perks. The
    // human picks theirs in the BootScene; each AI rival rolls a random one
    // so they get the same fairness levers (loan APR, repair discount,
    // condition decay slowdown, etc.) the human enjoys. The "live" perks
    // (repair cost, decay, duty-free mult, loan APR) are read per-player
    // by the respective systems from `getCEO(player.ceoId)`.
    const humanCEO = getCEO(ceoId) ?? getCEO(DEFAULT_CEO_ID);
    for (const player of this.players) {
      const ceo = player.isAI
        ? CEOS[Math.floor(Math.random() * CEOS.length)]
        : humanCEO;
      if (!ceo) continue;
      player.ceoId = ceo.id;
      if (ceo.perks.cashBonus) player.cash += ceo.perks.cashBonus;
      if (ceo.perks.startingInventory) {
        for (const [itemId, n] of Object.entries(ceo.perks.startingInventory)) {
          player.inventory[itemId] = (player.inventory[itemId] ?? 0) + n;
        }
      }
    }

    const ceoLabel = humanCEO ? ` — CEO: ${humanCEO.name}` : '';
    this.pushNews(`Welcome to ${this.human.name}. Difficulty: ${cfg.label}${ceoLabel}.`);
  }
}

/**
 * Pick `count` random AI starting hubs from major-demand cities (>= 1.0)
 * that aren't the human's hub and aren't duplicates of each other.
 * Falls back to lower-demand cities if there aren't enough major ones
 * left (shouldn't happen at the current catalog size, but defensive).
 */
function pickRandomAIHubs(humanHub: string, count: number): string[] {
  const major = CITIES.filter(c => c.demand >= 1.0 && c.id !== humanHub);
  const shuffled = [...major].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, count).map(c => c.id);
  // Defensive top-up if the major pool was tiny.
  if (picked.length < count) {
    const fallback = CITIES.filter(c => c.id !== humanHub && !picked.includes(c.id));
    const shuffledFallback = [...fallback].sort(() => Math.random() - 0.5);
    picked.push(...shuffledFallback.slice(0, count - picked.length).map(c => c.id));
  }
  return picked;
}
