// Per-plane upgrades — buyable in the Workshop's Outfit tab. Three slots
// per plane (livery / interior / entertainment), each holding the id of
// at most one Upgrade from the matching category. Effects accumulate at
// flight time: load-factor bonuses multiply into passenger count, and
// reputation bonuses tick on every successful revenue arrival.

export type UpgradeCategory = 'livery' | 'interior' | 'entertainment';

export interface Upgrade {
  id: string;
  category: UpgradeCategory;
  name: string;
  price: number;
  description: string;
  /** Multiplicative bonus to expected load factor (0.05 = +5%). */
  loadFactorBonus?: number;
  /** Reputation gained per successful (revenue) arrival. Fractions ok —
   *  they accumulate across many flights. */
  reputationPerFlight?: number;
  /** Livery-only: secondary color painted on the tail fin so each livery
   *  reads distinctly on the apron. Falls back to the airline base color
   *  when unset. */
  accentColor?: number;
}

export const UPGRADES: Upgrade[] = [
  // ---- Livery (paint scheme — cosmetic identity + small reputation drip)
  { id: 'classic-stripe',  category: 'livery', name: 'Classic Stripe',  price:  50_000,
    reputationPerFlight: 0.05, accentColor: 0xa0a8b4,
    description: 'Twin-stripe livery. Recognizable on the apron.' },
  { id: 'tropical-sunset', category: 'livery', name: 'Tropical Sunset', price: 120_000,
    reputationPerFlight: 0.10, accentColor: 0xff8855,
    description: 'Vibrant gradient evoking the Hawaiian skyline.' },
  { id: 'gold-trim',       category: 'livery', name: 'Gold Trim',       price: 250_000,
    reputationPerFlight: 0.18, accentColor: 0xffd700,
    description: 'Gilt accents along the fuselage. Catches the eye on every approach.' },
  { id: 'carbon-matte',    category: 'livery', name: 'Carbon Matte',    price: 400_000,
    reputationPerFlight: 0.25, accentColor: 0x2a2a2a,
    description: 'Premium matte finish. Looks expensive because it is.' },

  // ---- Interior (seating — primary load-factor driver)
  { id: 'premium-seats',   category: 'interior', name: 'Premium Seats',   price: 180_000,
    loadFactorBonus: 0.05,
    description: '+2 inches of legroom, recliners in every row.' },
  { id: 'business-cabin',  category: 'interior', name: 'Business Cabin',  price: 550_000,
    loadFactorBonus: 0.10,
    description: 'Convertible business cabin with USB-C at every seat.' },
  { id: 'flat-bed-suites', category: 'interior', name: 'Lie-Flat Suites', price: 1_200_000,
    loadFactorBonus: 0.16,
    description: 'Top-tier lie-flat suites. Pays off on long-haul.' },

  // ---- Entertainment (smaller LF bump but cheaper)
  { id: 'wifi',            category: 'entertainment', name: 'Onboard Wi-Fi',    price:  90_000,
    loadFactorBonus: 0.03,
    description: 'Free in-flight internet. Business travelers expect it now.' },
  { id: 'avod',            category: 'entertainment', name: 'Seat-back AVOD',   price: 240_000,
    loadFactorBonus: 0.06,
    description: 'On-demand video at every seat. Hides the boredom on long hops.' },
  { id: 'streaming-suite', category: 'entertainment', name: 'Streaming Suite',  price: 480_000,
    loadFactorBonus: 0.09,
    description: 'Cast to your own device + premium service partnerships.' },
];

export function getUpgrade(id: string): Upgrade | undefined {
  return UPGRADES.find(u => u.id === id);
}

/** Combined load-factor multiplier from a plane's interior + entertainment
 *  upgrades. Returns 1.0 (no bonus) for a plane with no relevant upgrades. */
export function planeLoadFactorBonus(upgrades: PlaneUpgrades): number {
  let mult = 1;
  for (const cat of ['interior', 'entertainment'] as const) {
    const u = upgrades[cat] ? getUpgrade(upgrades[cat] as string) : undefined;
    if (u?.loadFactorBonus) mult *= 1 + u.loadFactorBonus;
  }
  return mult;
}

/** Combined per-flight reputation drip from a plane's upgrades. */
export function planeReputationPerFlight(upgrades: PlaneUpgrades): number {
  let total = 0;
  for (const cat of ['livery', 'interior', 'entertainment'] as const) {
    const u = upgrades[cat] ? getUpgrade(upgrades[cat] as string) : undefined;
    if (u?.reputationPerFlight) total += u.reputationPerFlight;
  }
  return total;
}

/** A plane's currently-equipped upgrades. At most one per category. */
export interface PlaneUpgrades {
  livery?: string;
  interior?: string;
  entertainment?: string;
}

/** Tail-fin color from a plane's equipped livery, or undefined if no
 *  livery (or the livery has no `accentColor`). Used by makePlaneIcon to
 *  tint the tail. */
export function liveryAccent(upgrades: PlaneUpgrades): number | undefined {
  const id = upgrades.livery;
  if (!id) return undefined;
  return getUpgrade(id)?.accentColor;
}
