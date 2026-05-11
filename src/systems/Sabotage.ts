import { GameState, GameDate } from '../state/GameState';
import { Player } from '../state/Player';
import { Plane } from '../state/Plane';
import { ITEMS, getItem, Item } from '../state/items';
import { applyDemandMod } from '../state/demandModifiers';
import { getCity } from '../state/catalog';
import { getDifficulty } from '../state/Difficulty';
import { clock } from './Clock';

function dateToMinutes(d: GameDate): number {
  return ((((d.year * 12 + (d.month - 1)) * 30 + (d.day - 1)) * 24 + d.hour) * 60) + d.minute;
}

/** Force a plane into maintenance status for the given number of game-minutes.
 *  Only idle planes can be grounded directly — a flying plane lands first,
 *  then becomes idle; saboteur code falls back to a condition hit in that
 *  case. Released back to 'idle' by Flights.releaseMaintenancePlanes when
 *  scene.date catches up to doneAt. */
function groundPlane(plane: Plane, gameMin: number): boolean {
  if (plane.status.kind !== 'idle') return false;
  const now = dateToMinutes(GameState.get().date);
  plane.status = {
    kind: 'maintenance',
    airportId: plane.status.airportId,
    doneAt: now + gameMin,
  };
  return true;
}

/** Total defense rating for a player = sum over inventory of defense items. */
export function defenseRating(p: Player): number {
  let total = 0;
  for (const id of Object.keys(p.inventory)) {
    const item = ITEMS.find(x => x.id === id);
    if (!item || item.category !== 'defense') continue;
    total += (item.defenseRating ?? 0) * p.inventory[id];
  }
  return total;
}

/** All sabotage items the player owns (flat list, one entry per item id). */
export function sabotageInventory(p: Player): { item: Item; count: number }[] {
  const out: { item: Item; count: number }[] = [];
  for (const id of Object.keys(p.inventory)) {
    const item = ITEMS.find(x => x.id === id);
    if (!item || item.category !== 'sabotage') continue;
    if (p.inventory[id] > 0) out.push({ item, count: p.inventory[id] });
  }
  return out;
}

interface SabotageOutcome {
  blocked: boolean;
  detected: boolean;
  effectSummary: string;
}

/**
 * Resolve a sabotage attempt by `attacker` against `target` using `item`.
 * Returns a summary used by news + UI. Consumes one item from attacker's inventory.
 */
export function attemptSabotage(attacker: Player, target: Player, item: Item): SabotageOutcome {
  // Consume attacker's item.
  attacker.inventory[item.id] = (attacker.inventory[item.id] ?? 0) - 1;
  if (attacker.inventory[item.id] <= 0) delete attacker.inventory[item.id];

  // Defense check: each 10 rating ≈ 8% blocked chance, capped 80%.
  const def = defenseRating(target);
  const blockChance = Math.min(0.80, def * 0.008);
  const blocked = Math.random() < blockChance;

  if (blocked) {
    // Defense item consumed in the intercept — pick the strongest defense item.
    const defItems = Object.keys(target.inventory)
      .map(id => ({ id, item: getItem(id) }))
      .filter(x => x.item.category === 'defense' && (x.item.defenseRating ?? 0) > 0)
      .sort((a, b) => (b.item.defenseRating ?? 0) - (a.item.defenseRating ?? 0));
    if (defItems.length > 0) {
      const consumed = defItems[0];
      target.inventory[consumed.id] -= 1;
      if (target.inventory[consumed.id] <= 0) delete target.inventory[consumed.id];
    }
    // Detection chance is high when blocked.
    const detected = Math.random() < 0.75;
    if (detected) {
      attacker.reputation = Math.max(0, attacker.reputation - 8);
    }
    return {
      blocked: true,
      detected,
      effectSummary: detected
        ? `Sabotage blocked by ${target.name}'s security — attacker exposed, ${attacker.name} reputation −8`
        : `Sabotage blocked by ${target.name}'s security`,
    };
  }

  // Sabotage lands. Each item has both an immediate hit (reputation, demand)
  // and — for the heavier ones — a grounding effect that puts target planes
  // into the existing `maintenance` status until their doneAt clears.
  // Saboteur can only ground IDLE planes (sneak into hangar); flying planes
  // get a condition hit instead, which raises crash odds on landing.
  let summary = '';
  switch (item.id) {
    case 'banana-peel':
      target.reputation = Math.max(0, target.reputation - 5);
      summary = `${target.name} reputation −5`;
      break;

    case 'super-glue': {
      // Grounds one parked plane for 6 game-hours. Falls back to a
      // condition hit on a flying plane if nothing's parked.
      const idle = target.planes.filter(p => p.status.kind === 'idle');
      const flying = target.planes.filter(p =>
        p.status.kind === 'flying' || p.status.kind === 'cargo' || p.status.kind === 'ferry'
      );
      target.reputation = Math.max(0, target.reputation - 5);
      if (idle.length > 0) {
        const plane = idle[Math.floor(Math.random() * idle.length)];
        plane.condition = Math.max(0.1, plane.condition * 0.6);
        groundPlane(plane, 6 * 60);
        summary = `${plane.name} grounded 6h, condition cut to ${Math.round(plane.condition * 100)}%; ${target.name} rep −5`;
      } else if (flying.length > 0) {
        const plane = flying[Math.floor(Math.random() * flying.length)];
        plane.condition = Math.max(0.1, plane.condition * 0.4);
        summary = `${plane.name} (in flight) condition cratered to ${Math.round(plane.condition * 100)}%; ${target.name} rep −5`;
      } else {
        summary = `${target.name} reputation −5 (no planes to damage)`;
      }
      break;
    }

    case 'virus-usb': {
      // Hits the TARGET'S home hub specifically (not the global HNL) — a
      // London-based rival is hit at LHR, etc. 50% demand mod for 4 days
      // is a meaningful revenue dent.
      const homeHub = target.hubs[0];
      applyDemandMod(homeHub, 0.5, 4, GameState.get().date);
      target.reputation = Math.max(0, target.reputation - 7);
      summary = `${getCity(homeHub).name} demand −50% for 4 days, ${target.name} rep −7`;
      break;
    }

    case 'incendiary': {
      // The headline weapon. Grounds up to 3 parked planes for 12 hours,
      // each with severely cratered condition. Rep hit is significant.
      target.reputation = Math.max(0, target.reputation - 20);
      const idle = target.planes.filter(p => p.status.kind === 'idle');
      const shuffled = [...idle].sort(() => Math.random() - 0.5).slice(0, 3);
      for (const plane of shuffled) {
        plane.condition = Math.max(0.1, plane.condition * 0.3);
        groundPlane(plane, 12 * 60);
      }
      const grounded = shuffled.length;
      summary = grounded > 0
        ? `Hangar fire — ${grounded} ${target.name} plane${grounded === 1 ? '' : 's'} grounded 12h; rep −20`
        : `Hangar fire at ${target.name} — rep −20 (no parked planes to torch)`;
      break;
    }

    default:
      summary = 'Effect: nominal';
  }

  // Detection chance even on success: K-9 unit boosts it noticeably.
  const k9Bonus = (target.inventory['k9'] ?? 0) > 0 ? 0.30 : 0;
  const detected = Math.random() < 0.15 + k9Bonus;
  if (detected) {
    attacker.reputation = Math.max(0, attacker.reputation - 6);
  }

  return {
    blocked: false,
    detected,
    effectSummary: detected
      ? `${summary}; saboteur identified as ${attacker.name} (−6 rep)`
      : summary,
  };
}

/** Daily AI sabotage roll. Each AI rival may stock + use a real Duty Free
 *  item against the run leader (or whoever's threatening their position).
 *  Pays cash for the item like a human would, then runs it through the same
 *  `attemptSabotage` resolver — so headlines name the AI when defenses
 *  catch the saboteur, just like they'd name the human on a failed attempt. */
export function aiDailySabotage() {
  const state = GameState.get();
  for (const ai of state.players) {
    if (!ai.isAI || state.takenOverBy[ai.id]) continue;
    const cfg = getDifficulty(state.difficulty);
    if (Math.random() > cfg.aiSabotageChance) continue;
    const targets = state.players.filter(p => p.id !== ai.id && !state.takenOverBy[p.id]);
    if (targets.length === 0) continue;
    // Bias toward whoever's ahead on cash — the more they're leading the
    // pack, the more attractive a sabotage target they make.
    const target = [...targets].sort((a, b) => b.cash - a.cash)[0];

    // Buy whichever sabotage item the AI can afford. Bigger cash war chest
    // = heavier item, so a flush rival can drop an incendiary on you.
    const buyable = ITEMS
      .filter(i => i.category === 'sabotage' && ai.cash >= i.price * 1.2)
      .sort((a, b) => b.price - a.price);
    if (buyable.length === 0) continue;
    // Pick the strongest the AI can comfortably afford, but with some
    // randomness so they don't always escalate to the max tier.
    const idx = Math.min(buyable.length - 1, Math.floor(Math.random() * 2));
    const chosen = buyable[idx];
    ai.cash -= chosen.price;
    ai.inventory[chosen.id] = (ai.inventory[chosen.id] ?? 0) + 1;

    // Route through the human's resolver so all effects + detection +
    // defense + news headlines stay consistent.
    const result = attemptSabotage(ai, target, chosen);
    const human = state.human;
    const targetingHuman = target.id === human.id;
    const severity = targetingHuman
      ? (result.blocked ? 'good' : 'bad')
      : 'neutral';

    if (result.blocked) {
      state.gameEvents.unshift({
        id: `sab-${state.gameEvents.length + 1}`,
        date: { ...state.date }, severity,
        headline: result.detected
          ? `${target.name} security catches ${ai.name} saboteur red-handed`
          : `${target.name} security foils sabotage attempt`,
        body: `An attempt to plant a ${chosen.name} at ${target.name}'s ${getCity(target.hubs[0]).name} hangar was intercepted.`,
        impact: result.effectSummary,
      });
      state.pushNews(result.detected
        ? `${target.name} caught a saboteur from ${ai.name}.`
        : `${target.name} blocked an unidentified sabotage attempt.`);
    } else {
      state.gameEvents.unshift({
        id: `sab-${state.gameEvents.length + 1}`,
        date: { ...state.date }, severity,
        headline: result.detected
          ? `${target.name} hit by ${chosen.name} — ${ai.name} implicated`
          : `${target.name} hit by sabotage`,
        body: `${result.effectSummary}.${result.detected ? ` Investigators link the attack to ${ai.name}.` : ' Saboteur unidentified.'}`,
        impact: result.effectSummary,
      });
      state.pushNews(result.detected
        ? `${target.name} sabotaged — ${ai.name} caught. ${result.effectSummary}`
        : `${target.name} sabotaged. ${result.effectSummary}`);
    }
  }
}

export function registerSabotageHooks() {
  clock.onDay(() => aiDailySabotage());
}
