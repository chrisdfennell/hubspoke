// Items sold in Duty Free. Sabotage items are consumed on use; defense items
// are consumed when they intercept an attempted sabotage. Boosts apply
// instantly when used.

export type ItemCategory = 'sabotage' | 'defense' | 'boost';

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  description: string;
  /** Sabotage tier: 1 light, 2 medium, 3 heavy. Used to bias effect strength. */
  power?: number;
  /** Defense rating: each owned unit reduces incoming sabotage success chance. */
  defenseRating?: number;
}

export const ITEMS: Item[] = [
  // ---- Sabotage ----
  { id: 'banana-peel', name: 'Banana Peel',         category: 'sabotage', price: 5_000,  power: 1,
    description: 'Slip a rival\'s ground crew. Light reputation hit.' },
  { id: 'super-glue',  name: 'Super Glue',          category: 'sabotage', price: 18_000, power: 2,
    description: 'Locks a rival plane\'s landing gear. Damages one aircraft.' },
  { id: 'virus-usb',   name: 'Virus USB Drive',     category: 'sabotage', price: 35_000, power: 2,
    description: 'Crashes a rival\'s booking system. Hits demand at their hub.' },
  { id: 'incendiary',  name: 'Incendiary Device',   category: 'sabotage', price: 90_000, power: 3,
    description: 'Hangar fire — heavy plane damage, big reputation hit on the rival.' },

  // ---- Defense ----
  { id: 'cctv',        name: 'CCTV System',         category: 'defense',  price: 25_000, defenseRating: 10,
    description: 'Reduces sabotage success rate against you.' },
  { id: 'k9',          name: 'Trained K-9 Unit',    category: 'defense',  price: 45_000, defenseRating: 15,
    description: 'Catches saboteurs in the act, exposing the attacker.' },
  { id: 'cyber-shield',name: 'Cyber Shield',        category: 'defense',  price: 95_000, defenseRating: 25,
    description: 'Blocks digital sabotage and tip-offs.' },

  // ---- Boosts (instant) ----
  { id: 'marketing',   name: 'Marketing Campaign',  category: 'boost',    price: 100_000,
    description: 'Public-facing ad blitz. +5 reputation immediately.' },
  { id: 'pilot-prog',  name: 'Pilot Training Course', category: 'boost',  price: 150_000,
    description: 'Refits and tunes your fleet — every plane +20% condition.' },
  { id: 'press-spin',  name: 'Press Conference',    category: 'boost',    price: 50_000,
    description: 'Spin your latest news. +3 reputation.' },
];

export function getItem(id: string): Item {
  const m = ITEMS.find(i => i.id === id);
  if (!m) throw new Error(`Unknown item: ${id}`);
  return m;
}
