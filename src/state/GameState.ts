import { Player, PlayerSnapshot } from './Player';
import { Plane } from './Plane';
import { Route } from './Route';
import { DEFAULT_AIRLINES, HOME_AIRPORT, getCity, getPlaneModel } from './catalog';
import { CEOS, getCEO, DEFAULT_CEO_ID } from './ceos';
import { getFuelPrice, setFuelPrice } from '../systems/Economy';
import { GameEvent } from '../systems/Events';
import { snapshotModifiers, restoreModifiers } from './demandModifiers';
import { CargoContract, getContractCounter, setContractCounter } from '../systems/Cargo';
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
};

/** Bump when a backwards-incompatible balance change ships. The migrator in
 *  Economy.migrateBalance() reads this to decide whether to rewrite legacy data. */
export const CURRENT_BALANCE_VERSION = 2;

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
  /** Net-worth milestones the human has already crossed. */
  milestonesReached?: string[];
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
  /** Ids of net-worth milestones the human has crossed. Tracked so each tier
   *  fires its news entry exactly once. */
  milestonesReached: string[] = [];

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
   *  etc.) land before any system hooks fire. */
  static reset(difficulty: Difficulty = 'normal', ceoId?: string): GameState {
    GameState.instance = new GameState();
    GameState.instance.difficulty = difficulty;
    GameState.instance.bootstrap(ceoId);
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
    s.gameEvents = snap.gameEvents ?? [];
    s.takenOverBy = snap.takenOverBy ?? {};
    s.cargoOffers = snap.cargoOffers ?? [];
    s.cargoActive = snap.cargoActive ?? [];
    s.cargoCompleted = snap.cargoCompleted ?? [];
    if (typeof snap.cargoCounter === 'number') setContractCounter(snap.cargoCounter);
    s.loungeContacts = snap.loungeContacts ?? [];
    if (typeof snap.loungeCounter === 'number') setLoungeCounter(snap.loungeCounter);
    s.difficulty = snap.difficulty ?? 'normal';
    s.settings = { ...DEFAULT_SETTINGS, ...(snap.settings ?? {}) };
    s.balanceVersion = snap.balanceVersion ?? 0;
    s.activeHub = snap.activeHub ?? HOME_AIRPORT;
    s.milestonesReached = [...(snap.milestonesReached ?? [])];
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
      gameEvents: this.gameEvents,
      demandModifiers: snapshotModifiers(),
      takenOverBy: { ...this.takenOverBy },
      cargoOffers: this.cargoOffers,
      cargoActive: this.cargoActive,
      cargoCompleted: this.cargoCompleted,
      cargoCounter: getContractCounter(),
      loungeContacts: this.loungeContacts,
      loungeCounter: getLoungeCounter(),
      difficulty: this.difficulty,
      settings: { ...this.settings },
      balanceVersion: this.balanceVersion,
      activeHub: this.activeHub,
      milestonesReached: [...this.milestonesReached],
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

  private bootstrap(ceoId?: string) {
    const cfg = getDifficulty(this.difficulty);
    DEFAULT_AIRLINES.forEach((a, i) => {
      this.players.push(new Player(a.id, a.name, a.color, i !== 0, cfg.startCash, a.home));
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

    // Initial share prices.
    for (const a of DEFAULT_AIRLINES) {
      this.stockPrices[a.id] = 50;
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
