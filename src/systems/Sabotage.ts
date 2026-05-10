import { GameState } from '../state/GameState';
import { Player } from '../state/Player';
import { ITEMS, getItem, Item } from '../state/items';
import { applyDemandMod } from '../state/demandModifiers';
import { HOME_AIRPORT } from '../state/catalog';
import { getDifficulty } from '../state/Difficulty';
import { clock } from './Clock';

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

  // Sabotage lands. Apply effect by item.
  let summary = '';
  switch (item.id) {
    case 'banana-peel':
      target.reputation = Math.max(0, target.reputation - 4);
      summary = `${target.name} reputation −4`;
      break;
    case 'super-glue': {
      if (target.planes.length > 0) {
        const plane = target.planes[Math.floor(Math.random() * target.planes.length)];
        plane.condition = Math.max(0.05, plane.condition * 0.5);
        summary = `${plane.name} condition halved`;
      } else {
        summary = 'No planes to damage; nominal effect';
      }
      break;
    }
    case 'virus-usb':
      applyDemandMod(HOME_AIRPORT, 0.6, 3, GameState.get().date);
      target.reputation = Math.max(0, target.reputation - 3);
      summary = `Honolulu demand −40% for 3 days, ${target.name} reputation −3`;
      break;
    case 'incendiary': {
      target.reputation = Math.max(0, target.reputation - 12);
      // Damage up to 2 planes.
      const planes = [...target.planes].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const plane of planes) plane.condition = Math.max(0.05, plane.condition * 0.4);
      summary = `${target.name} reputation −12, ${planes.length} plane(s) heavily damaged`;
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

/** Daily AI sabotage roll: each AI may attempt a light attack against the leader. */
export function aiDailySabotage() {
  const state = GameState.get();
  for (const ai of state.players) {
    if (!ai.isAI || state.takenOverBy[ai.id]) continue;
    const cfg = getDifficulty(state.difficulty);
    if (Math.random() > cfg.aiSabotageChance) continue;
    const targets = state.players.filter(p => p.id !== ai.id && !state.takenOverBy[p.id]);
    if (targets.length === 0) continue;
    const leader = targets.sort((a, b) => b.cash - a.cash)[0];
    // AI uses a "light" sabotage (banana peel) for free — they don't manage inventory.
    const item: Item = getItem('banana-peel');
    // Same defense check as items, but no inventory consumed.
    const def = defenseRating(leader);
    const blocked = Math.random() < Math.min(0.80, def * 0.008);
    if (blocked) {
      const detected = Math.random() < 0.75;
      if (detected) {
        ai.reputation = Math.max(0, ai.reputation - 5);
        state.gameEvents.unshift({
          id: `sab-${state.gameEvents.length + 1}`,
          date: { ...state.date }, severity: leader.id === state.human.id ? 'good' : 'neutral',
          headline: `${leader.name} security catches ${ai.name} saboteur`,
          body: `An attempted sabotage at ${leader.name}'s hangar was thwarted by on-site security.`,
          impact: `${ai.name} reputation −5`,
        });
        state.pushNews(`${leader.name} caught a saboteur from ${ai.name}.`);
      }
    } else {
      leader.reputation = Math.max(0, leader.reputation - 3);
      state.gameEvents.unshift({
        id: `sab-${state.gameEvents.length + 1}`,
        date: { ...state.date }, severity: leader.id === state.human.id ? 'bad' : 'neutral',
        headline: `${leader.name} hit by petty sabotage`,
        body: `Ground-crew incident at ${leader.name}. Saboteur unidentified.`,
        impact: `${leader.name} reputation −3`,
      });
      state.pushNews(`${leader.name} hit by sabotage. No suspect identified.`);
    }
    void item;
  }
}

export function registerSabotageHooks() {
  clock.onDay(() => aiDailySabotage());
}
