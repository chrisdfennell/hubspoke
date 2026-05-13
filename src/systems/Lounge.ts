import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { applyDemandMod } from '../state/demandModifiers';
import { HOME_AIRPORT, getCity } from '../state/catalog';
import { fundamentalValue } from './Stocks';
import { setFuelPrice, getFuelPrice } from './Economy';
import { clock } from './Clock';

export type ContactKind =
  | 'marketing-guru'
  | 'maintenance-inspector'
  | 'aviation-lobbyist'
  | 'stock-analyst'
  | 'fuel-trader'
  | 'press-baron'
  | 'mob-fixer';

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  role: string;
  fee: number;
  /** Required reputation. Some contacts won't deal with low-rep airlines. */
  minRep: number;
  pitch: string;
}

interface ContactBlueprint {
  kind: ContactKind;
  role: string;
  fee: number;
  minRep: number;
  pitch: string;
  apply: (player: Player) => string; // returns a result summary
}

const FIRST_NAMES = ['Lila', 'Marco', 'Yuki', 'Hassan', 'Ingrid', 'Diego', 'Priya', 'Karim', 'Sasha', 'Wen'];
const LAST_NAMES  = ['Okafor', 'Hawking', 'Reyes', 'Nakamura', 'Larsen', 'Aziz', 'Patel', 'Müller', 'Volkov', 'Chen'];

let _contactCounter = 1;
const nextContactId = () => `vip${_contactCounter++}`;

const BLUEPRINTS: ContactBlueprint[] = [
  {
    kind: 'marketing-guru',
    role: 'Marketing Guru',
    fee: 200_000,
    minRep: 0,
    pitch: 'A short, sharp ad blitz crafted for your brand.',
    apply: (p) => { p.reputation = Math.min(100, p.reputation + 8); return 'Reputation +8'; },
  },
  {
    kind: 'maintenance-inspector',
    role: 'Maintenance Inspector',
    fee: 600_000,
    minRep: 0,
    pitch: 'Off-the-books fleet inspection. Every plane returns to factory spec.',
    apply: (p) => {
      let n = 0;
      for (const plane of p.planes) {
        if (plane.condition < 1) { plane.condition = 1; n++; }
      }
      return `${n} plane(s) restored to 100% condition`;
    },
  },
  {
    kind: 'aviation-lobbyist',
    role: 'Aviation Lobbyist',
    fee: 350_000,
    minRep: 30,
    pitch: 'A favorable hearing in the right room. Demand surge at your hub.',
    apply: (p) => {
      const state = GameState.get();
      applyDemandMod(HOME_AIRPORT, 1.30, 4, state.date);
      void p;
      return `${getCity(HOME_AIRPORT).name} demand +30% for 4 days`;
    },
  },
  {
    kind: 'stock-analyst',
    role: 'Insider Stock Analyst',
    fee: 80_000,
    minRep: 50,
    pitch: 'A peek at the next quarter\'s earnings — for a price.',
    apply: (p) => {
      const state = GameState.get();
      // Reveal the rival whose price is most undervalued vs. fundamentals.
      const rivals = state.players.filter(x => x.id !== p.id && !state.takenOverBy[x.id]);
      if (rivals.length === 0) return 'No rivals to analyze';
      let best = rivals[0]; let bestSpread = -Infinity;
      for (const r of rivals) {
        const fund = fundamentalValue(r);
        const price = state.stockPrices[r.id] ?? fund;
        const spread = (fund - price) / Math.max(price, 1);
        if (spread > bestSpread) { bestSpread = spread; best = r; }
      }
      const direction = bestSpread > 0 ? 'undervalued — likely to rise' : 'overvalued — likely to fall';
      return `Tip: ${best.name} is ${direction} (current $${(state.stockPrices[best.id] ?? 0).toFixed(2)}, fundamental $${fundamentalValue(best).toFixed(2)})`;
    },
  },
  {
    kind: 'fuel-trader',
    role: 'Commodities Trader',
    fee: 200_000,
    minRep: 0,
    pitch: 'A futures contract that locks in a sweetheart fuel rate.',
    apply: (p) => {
      const cur = getFuelPrice();
      // Reduce fuel price by 25% (one-shot — drift will erase it eventually).
      setFuelPrice(cur * 0.75);
      void p;
      return `Fuel price cut from $${cur.toFixed(2)} to $${getFuelPrice().toFixed(2)} per liter`;
    },
  },
  {
    kind: 'press-baron',
    role: 'Press Baron',
    fee: 500_000,
    minRep: 40,
    pitch: 'A puff piece in tomorrow\'s morning edition.',
    apply: (p) => {
      const state = GameState.get();
      // Hit a random rival's reputation while bumping yours.
      const rivals = state.players.filter(x => x.id !== p.id && !state.takenOverBy[x.id]);
      const target = rivals.length > 0 ? rivals[Math.floor(Math.random() * rivals.length)] : null;
      p.reputation = Math.min(100, p.reputation + 4);
      if (target) target.reputation = Math.max(0, target.reputation - 4);
      return target ? `+4 rep for you, −4 for ${target.name}` : '+4 reputation';
    },
  },
  {
    kind: 'mob-fixer',
    role: 'Mob Fixer',
    fee: 1_200_000,
    minRep: 0,
    pitch: 'No questions asked. A rival\'s problem becomes... bigger.',
    apply: (p) => {
      const state = GameState.get();
      const rivals = state.players.filter(x => x.id !== p.id && !state.takenOverBy[x.id]);
      if (rivals.length === 0) return 'No targets available';
      const target = rivals[Math.floor(Math.random() * rivals.length)];
      target.reputation = Math.max(0, target.reputation - 10);
      // Damage a random plane.
      if (target.planes.length > 0) {
        const plane = target.planes[Math.floor(Math.random() * target.planes.length)];
        plane.condition = Math.max(0.1, plane.condition * 0.4);
      }
      // Detection chance hits the player too — these things leak.
      if (Math.random() < 0.30) {
        p.reputation = Math.max(0, p.reputation - 6);
        return `${target.name} hit hard, but the trail ties back to you (−6 rep)`;
      }
      return `${target.name} reputation −10, fleet damage applied. Clean job.`;
    },
  },
];

function randomName(): string {
  const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${f} ${l}`;
}

function rollContact(): Contact {
  const bp = BLUEPRINTS[Math.floor(Math.random() * BLUEPRINTS.length)];
  return {
    id: nextContactId(),
    kind: bp.kind,
    name: randomName(),
    role: bp.role,
    fee: bp.fee,
    minRep: bp.minRep,
    pitch: bp.pitch,
  };
}

export function refreshContacts() {
  const state = GameState.get();
  state.loungeContacts = [];
  const seenKinds = new Set<ContactKind>();
  // 4 unique-kind contacts.
  while (state.loungeContacts.length < 4) {
    const c = rollContact();
    if (seenKinds.has(c.kind)) continue;
    seenKinds.add(c.kind);
    state.loungeContacts.push(c);
  }
}

/** Visit a contact: charges fee, applies effect, removes the contact. */
export function visitContact(player: Player, contactId: string): { ok: true; summary: string } | { ok: false; reason: string } {
  const state = GameState.get();
  const idx = state.loungeContacts.findIndex(c => c.id === contactId);
  if (idx < 0) return { ok: false, reason: 'Contact not available' };
  const c = state.loungeContacts[idx];
  if (player.reputation < c.minRep) return { ok: false, reason: `Reputation ${c.minRep}+ required` };
  if (player.cash < c.fee) return { ok: false, reason: 'Insufficient cash' };
  const bp = BLUEPRINTS.find(b => b.kind === c.kind);
  if (!bp) return { ok: false, reason: 'Unknown contact' };
  player.cash -= c.fee;
  const summary = bp.apply(player);
  state.loungeContacts.splice(idx, 1);
  // Only the human gets a news entry on their own lounge visits — AI
  // rivals visit contacts too, but flooding the ticker with every AI
  // marketing/maintenance buy would drown out everything else.
  if (!player.isAI) {
    state.pushNews(`Met ${c.name} (${c.role}) — ${summary}`);
  }
  return { ok: true, summary };
}

export function setLoungeCounter(n: number) { _contactCounter = Math.max(_contactCounter, n); }
export function getLoungeCounter(): number { return _contactCounter; }

export function registerLoungeHooks() {
  clock.onDay(() => refreshContacts());
}
