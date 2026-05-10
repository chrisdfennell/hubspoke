import { Player, PlayerSnapshot } from './Player';
import { Plane } from './Plane';
import { Route } from './Route';
import { DEFAULT_AIRLINES, HOME_AIRPORT, getCity, getPlaneModel } from './catalog';
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
}

export const DEFAULT_SETTINGS: GameSettings = {
  skipUnprofitable: false,
  minLoadFactorForTakeoff: 0,
  pauseOnRoomEntry: false,
};

/** Bump when a backwards-incompatible balance change ships. The migrator in
 *  Economy.migrateBalance() reads this to decide whether to rewrite legacy data. */
export const CURRENT_BALANCE_VERSION = 2;

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

  static instance: GameState | null = null;

  static get(): GameState {
    if (!GameState.instance) {
      GameState.instance = new GameState();
      GameState.instance.bootstrap();
    }
    return GameState.instance;
  }

  /** Reset to a fresh new game. */
  static reset(difficulty: Difficulty = 'normal'): GameState {
    GameState.instance = new GameState();
    GameState.instance.difficulty = difficulty;
    GameState.instance.bootstrap();
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

  private bootstrap() {
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

    this.pushNews(`Welcome to ${this.human.name}. Difficulty: ${cfg.label}.`);
  }
}
