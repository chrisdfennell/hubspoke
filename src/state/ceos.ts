// CEO presets — modeled on the original Airline Tycoon's character roster.
// Each CEO is a thin perk bundle applied at game start; the runtime reads
// `player.ceoId` and applies the relevant discount/multiplier at the
// appropriate touchpoint (Workshop repairs, Duty Free, loan APR, etc).
//
// Perks are intentionally chunky and easy to reason about — one or two
// numeric levers per CEO. A new run with a different CEO should feel
// different, not just shuffled.

export interface CEOPerks {
  /** +$ added to the difficulty's starting cash. */
  cashBonus?: number;
  /** Multiplier on the difficulty's loan APR (Anita gets 0.7×). */
  loanAprMult?: number;
  /** Multiplier on Workshop / auto-repair cost (Igor gets 0.5×). */
  repairCostMult?: number;
  /** Multiplier on per-flight condition decay (Igor gets 0.5×). */
  conditionDecayMult?: number;
  /** Multiplier on Duty Free item prices (Mario gets 0.75×). */
  dutyFreeMult?: number;
  /** Inventory items granted at game start (id → count). Sven gets defense gear. */
  startingInventory?: Record<string, number>;
}

export interface CEO {
  id: string;
  name: string;
  /** Short epithet shown under the name on the picker card. */
  epithet: string;
  /** One-line flavor text. */
  tagline: string;
  /** Two-line description of the mechanical perk for the picker UI. */
  perkBlurb: string;
  /** Glyph rendered as a stand-in for a portrait (no art assets yet). */
  glyph: string;
  /** Accent color used for the picker card border + HUD label. */
  color: number;
  perks: CEOPerks;
}

export const CEOS: CEO[] = [
  {
    id: 'mario',
    name: 'Mario Zucchero',
    epithet: 'The Charmer',
    tagline: '"Friends in every airport — and cheaper deals everywhere."',
    perkBlurb: 'Duty Free items 25% off. Starts with a couple of party favors.',
    glyph: '🕴',
    color: 0xff9b4a,
    perks: {
      dutyFreeMult: 0.75,
      startingInventory: { 'banana-peel': 2 },
    },
  },
  {
    id: 'igor',
    name: 'Igor Tuppolevski',
    epithet: 'The Engineer',
    tagline: '"Built to fly. Built to last."',
    perkBlurb: 'Workshop repairs 50% off. Planes wear 50% slower.',
    glyph: '🔧',
    color: 0x9ec8ff,
    perks: {
      repairCostMult: 0.5,
      conditionDecayMult: 0.5,
    },
  },
  {
    id: 'sven',
    name: 'Sven Hassel',
    epithet: 'The Stoic',
    tagline: '"Storm clouds passing. They always pass over."',
    perkBlurb: 'Starts with 2× CCTV + 1× Cyber Shield to repel saboteurs.',
    glyph: '🛡',
    color: 0xa6d8a3,
    perks: {
      startingInventory: { 'cctv': 2, 'cyber-shield': 1 },
    },
  },
  {
    id: 'anita',
    name: 'Anita Mansion',
    epithet: 'The Tycoon',
    tagline: '"Numbers, leverage, and a smile."',
    perkBlurb: '+$1M starting cash. Loans 30% cheaper.',
    glyph: '💼',
    color: 0xffd970,
    perks: {
      cashBonus: 1_000_000,
      loanAprMult: 0.7,
    },
  },
];

export function getCEO(id: string | undefined): CEO | undefined {
  if (!id) return undefined;
  return CEOS.find(c => c.id === id);
}

/** Default fallback for legacy saves / human play without a chosen CEO. */
export const DEFAULT_CEO_ID = 'anita';
