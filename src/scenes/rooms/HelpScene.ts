import { COLORS } from '../../config';
import { RoomScene } from '../../ui/RoomScene';

interface Section {
  title: string;
  body: string[];   // each entry is one line; bullets prefixed with •
}

const SECTIONS: Section[] = [
  {
    title: 'Getting started',
    body: [
      'You run an airline. Open routes between cities, buy planes to fly them, hire',
      'crew to staff the planes, and try to outearn (or absorb) the AI rivals.',
      '',
      '• Click any of the 12 rooms in the airport to enter it. ESC to leave a room.',
      '• Speed buttons in the top right run the world clock at 1× / 2× / 4×.',
      '• You can pause anytime with the || button. Speed and pause persist with the save.',
      '• Auto-save fires every game-hour. Multi-slot save UI is on the title screen.',
    ],
  },
  {
    title: 'Travel Agency — opening routes',
    body: [
      'Routes are city pairs. Open a route, assign a plane, and the dispatcher will',
      'fly it back and forth automatically as long as it has crew and fuel.',
      '',
      '• Suggested fare = $30 base + $0.12/km × city demand. You can adjust ±$10.',
      '• Charging exactly the suggested fare gives you the best load factor (~0.90).',
      '• Charging too much drops load factor; too little eats your margin.',
      '• A plane can only fly a route from one of its endpoints — use Ferry to move it.',
      '• Existing routes only show for the active hub. Switch hubs at the top to see others.',
    ],
  },
  {
    title: 'Hubs — operating from multiple cities',
    body: [
      'You start with one hub (Honolulu). Buy more in the Control Tower world map.',
      '',
      '• Click any city dot in the world map → "Buy hub for $X". Cost scales with',
      '  the city\'s demand: $5M for Honolulu, up to $7.5M for New York / London.',
      '• Each hub gets its own routes. Plan: open feeder routes from a hub.',
      '• Use the Ferry button on each plane (Office → Fleet tab) to move planes',
      '  between hubs at fuel cost only.',
      '• AI rivals each have their own home: Falcon → LAX, Phoenix → JFK, Tucan → LHR.',
    ],
  },
  {
    title: 'Workshop — buying & repairing planes',
    body: [
      'Planes come in five tiers. Range matters more than seats early — a Cessna',
      'can\'t fly farther than the Hawaiian islands.',
      '',
      '• Cessna 208 — 13 seats, 1,900 km range. Starter, Hawaii hops only.',
      '• Q400 / ATR-72 — regional turboprops, 2,000 km range, 70-78 seats.',
      '• A220 / B737 / A320 — single-aisle jets, 5,000-6,700 km range.',
      '• B747 / A380 — wide-bodies, 13,000+ km range, 400-555 seats.',
      '',
      '• Repair cost = (1 - condition) × plane price × 2%. Plan for it in your budget.',
      '• Daily idle maintenance is small now (~$600/day for a Cessna).',
    ],
  },
  {
    title: 'Bank, Stocks, Personnel',
    body: [
      '• Bank: take out loans up to your credit limit (scales with reputation +',
      '  fleet value). Park spare cash in savings — small daily yield.',
      '• Stocks: every airline has a tradable share price. Reach 50% of a rival\'s',
      '  shares to begin a takeover. Reaching 100% wipes them out.',
      '• Personnel: each plane needs 1 pilot + 1 mechanic to be dispatchable.',
      '  Crew shortfall grounds your latest planes first (deterministic, by index).',
    ],
  },
  {
    title: 'Settings — gameplay levers (⚙ in HUD)',
    body: [
      '• Skip flights that would lose money — dispatcher refuses to fly when the',
      '  estimated profit on this leg would be negative. Useful for protecting',
      '  margin during demand events or heavy competition.',
      '• Wait for plane to fill (Off / 30 / 50 / 70%) — gates takeoffs until the',
      '  expected load factor reaches the threshold. Each dispatched flight is',
      '  guaranteed to land at least at the threshold (rewards patience).',
      '• Auto-pause when entering a room — handy if you want time to think.',
    ],
  },
  {
    title: 'Win / lose conditions',
    body: [
      'Two paths to victory:',
      '• Take over every rival airline (acquire ≥ 50% of their shares).',
      '• Reach $1 BILLION net worth (cash + savings + portfolio − loan).',
      '',
      'Defeat:',
      '• Cash drops below −$5M while loan is at the credit ceiling. Bankruptcy.',
      '• A rival acquires majority of YOUR shares. Get out by buying back.',
    ],
  },
  {
    title: 'Keyboard shortcuts',
    body: [
      'Airport (main hub view):',
      '• 1-9 / 0 / - / =   Open one of the 12 rooms in declaration order.',
      '• ESC               Leave the active room.',
      '',
      'World Map (Control Tower):',
      '• Mouse wheel       Zoom in/out at the cursor.',
      '• Click + drag      Pan.',
      '• 0                 Reset view.',
      '',
      'Modals:',
      '• Enter             Confirm / submit.',
      '• Escape            Cancel.',
    ],
  },
  {
    title: 'Tips & tricks',
    body: [
      '• Wait until the suggested fare is profitable before opening a route.',
      '  Routes priced too low can\'t cover fuel + ops on a Cessna.',
      '• Fuel price drifts daily but mean-reverts to $0.80 — don\'t panic-sell',
      '  during a temporary spike, just slow your dispatch with the threshold.',
      '• A second hub spreads AI competition: rivals stay near their own home,',
      '  so opening routes far from HNL is mostly a monopoly.',
      '• Repairs in the Workshop are cheaper than letting condition slide too far.',
      '• Stock the lounge with contacts daily — the Maintenance Inspector restores',
      '  every plane to 100% for a flat fee, often cheaper than per-plane repairs.',
    ],
  },
];

export class HelpScene extends RoomScene {
  constructor() { super('HelpScene'); this.title = 'Help — Tips & Tricks'; }

  buildRoom() {
    const b = this.panelBounds;
    const left = b.x + 30;
    let y = b.y + 80;

    this.addText(left, y,
      'Click and ESC to leave. Scroll with the mouse wheel or Page Up / Page Down.',
      12, COLORS.textDim);
    y += 26;

    for (const section of SECTIONS) {
      this.addText(left, y, section.title, 17, COLORS.accentText);
      y += 26;
      for (const line of section.body) {
        if (line === '') {
          y += 10;
          continue;
        }
        const isBullet = line.trimStart().startsWith('•');
        this.addText(left + (isBullet ? 0 : 0), y, line, 13,
          isBullet ? COLORS.text : COLORS.textDim);
        y += 18;
      }
      y += 16;
    }

    this.reportContentBottom(y);
  }
}
