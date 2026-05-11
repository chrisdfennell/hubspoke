import { GameState } from '../state/GameState';
import { clock, formatMoney } from './Clock';
import { sound } from './Sound';

/**
 * Random intervention events — periodic decision modals that ask the
 * player to choose between two options with different cost/reputation
 * trade-offs. Each fires at most once every COOLDOWN_DAYS so the player
 * isn't drowning in modals, and roll chance gives roughly one event per
 * 7 in-game days on average.
 *
 * Module-scope state (not persisted with the save — a transient gameplay
 * beat, not durable progression). Reset between runs via
 * `resetInterventions()` from BootScene.go(), mirroring the newspaper.
 */

const COOLDOWN_DAYS = 5;
const DAILY_ROLL_CHANCE = 0.18;

export interface InterventionOption {
  label: string;
  /** When set and the predicate fails, the button renders disabled with
   *  this reason as a tooltip/inline hint. */
  disabledReason?(state: GameState): string | null;
  apply(state: GameState): void;
}

export interface Intervention {
  id: string;
  title: string;
  description: string;
  options: [InterventionOption, InterventionOption];
  /** Optional state line shown above the buttons (e.g., "Cash: $123,456"). */
  footer?(state: GameState): string;
}

interface InterventionTemplate {
  id: string;
  /** True when the player's state makes this event possible (e.g., owning
   *  at least one plane for a maintenance event). */
  requires(state: GameState): boolean;
  build(state: GameState): Intervention;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TEMPLATES: InterventionTemplate[] = [
  // ----- Engine inspection flag: gamble between paying for an overhaul
  // and patching it, the patch being a real downgrade so it's a coin-flip
  // saving on a marginal plane vs. paying to actually fix it. -----
  {
    id: 'engine-flag',
    requires: (s) => s.human.planes.length > 0,
    build: (s) => {
      const plane = pick(s.human.planes);
      const overhaulCost = 30_000;
      const patchCost = 5_000;
      return {
        id: 'engine-flag',
        title: 'Engine Inspection Flag',
        description:
          `Maintenance flagged a worn turbine on ${plane.name} (${plane.model.name}). ` +
          `You can pay for a full overhaul — pristine again — or patch it and roll the dice. ` +
          `The patch will leave the plane in worse shape than it is now.`,
        options: [
          {
            label: `Full overhaul (${formatMoney(overhaulCost)})`,
            disabledReason: (st) => st.human.cash >= overhaulCost ? null : 'Not enough cash.',
            apply: (st) => {
              st.human.cash -= overhaulCost;
              plane.condition = Math.min(1, plane.condition + 0.30);
              st.pushNews(`Workshop overhauled ${plane.name} — condition restored.`);
            },
          },
          {
            label: `Patch it (${formatMoney(patchCost)})`,
            disabledReason: (st) => st.human.cash >= patchCost ? null : 'Not enough cash.',
            apply: (st) => {
              st.human.cash -= patchCost;
              plane.condition = Math.max(0.10, plane.condition - 0.10);
              st.pushNews(`Workshop patched ${plane.name} — at-risk turbine still on the airframe.`);
            },
          },
        ],
        footer: (st) => `${plane.name} condition: ${Math.round(plane.condition * 100)}%   ·   Cash: ${formatMoney(st.human.cash)}`,
      };
    },
  },

  // ----- Pilots union raise demand: cash vs reputation tradeoff. -----
  {
    id: 'pilot-raise',
    requires: (s) => s.human.pilots > 0,
    build: () => ({
      id: 'pilot-raise',
      title: "Pilots' Union Demands",
      description:
        'A delegation from the pilots\' union has filed for a one-time bonus payment in exchange for ' +
        'a no-strike pledge through the year. The cabin crew is watching to see how you respond.',
      options: [
        {
          label: 'Pay the bonus ($15,000)',
          disabledReason: (st) => st.human.cash >= 15_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 15_000;
            st.human.reputation = Math.min(100, st.human.reputation + 5);
            st.pushNews(`${st.human.name} paid pilots' bonus — union signs no-strike pledge. Crew morale up.`);
          },
        },
        {
          label: 'Refuse (−3 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 3);
            st.pushNews(`⚠ ${st.human.name} rejected pilots' bonus demand. Union vows to remember at the next negotiation.`);
          },
        },
      ],
    }),
  },

  // ----- Celebrity charter: one-shot bonus + rep, easy "good" event. -----
  {
    id: 'celebrity-charter',
    requires: (s) => s.human.planes.length > 0,
    build: () => ({
      id: 'celebrity-charter',
      title: 'Celebrity Charter Offer',
      description:
        'A film studio is looking for a charter flight to ferry their cast and crew between sets. ' +
        'It\'s a one-off shoot but the brand exposure could be significant — they\'ll pay above market ' +
        'and you\'ll get a small reputation lift from the press coverage.',
      options: [
        {
          label: 'Accept charter (+$40,000, +3 reputation)',
          apply: (st) => {
            st.human.cash += 40_000;
            st.human.reputation = Math.min(100, st.human.reputation + 3);
            st.pushNews(`${st.human.name} flew a celebrity charter — front-page press, $40k pocketed.`);
          },
        },
        {
          label: 'Decline',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined a celebrity charter. The studio went with a rival.`);
          },
        },
      ],
    }),
  },

  // ----- Whistleblower threat: pay or risk public scandal. -----
  {
    id: 'whistleblower',
    requires: (s) => s.stats.flights > 5,
    build: () => ({
      id: 'whistleblower',
      title: 'Anonymous Threat',
      description:
        'A former Ops manager is threatening to leak internal scheduling documents to a journalist. ' +
        'They want $15,000 in exchange for silence. There\'s no proof anything in the documents is ' +
        'actually damaging — but you don\'t know what they have.',
      options: [
        {
          label: 'Pay them off ($15,000)',
          disabledReason: (st) => st.human.cash >= 15_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 15_000;
            st.pushNews(`${st.human.name} settled a private dispute. Documents never surface.`);
          },
        },
        {
          label: 'Ignore the threat (−8 reputation if it goes public)',
          apply: (st) => {
            // 70% chance it actually does go public, 30% it was a bluff.
            if (Math.random() < 0.7) {
              st.human.reputation = Math.max(0, st.human.reputation - 8);
              st.pushNews(`⚠ Leaked documents embarrass ${st.human.name}. Reputation hit.`);
            } else {
              st.pushNews(`${st.human.name} called a bluff. The threat fizzled out.`);
            }
          },
        },
      ],
    }),
  },

  // ----- Fuel kickback: easy bonus cash. -----
  {
    id: 'fuel-kickback',
    requires: () => true,
    build: () => ({
      id: 'fuel-kickback',
      title: 'Fuel Supplier Kickback',
      description:
        'Your fuel supplier is offering a one-time loyalty rebate — a $25,000 quiet cash payment ' +
        'in exchange for a public statement of "preferred supplier" status. No exclusivity clause; ' +
        'no obligation beyond the announcement.',
      options: [
        {
          label: 'Accept rebate (+$25,000)',
          apply: (st) => {
            st.human.cash += 25_000;
            st.pushNews(`${st.human.name} named a "preferred fuel supplier" — $25k rebate hits the books.`);
          },
        },
        {
          label: 'Decline (keep neutrality)',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined a supplier kickback offer.`);
          },
        },
      ],
    }),
  },

  // ----- Charity gala: trade money for reputation. -----
  {
    id: 'charity-gala',
    requires: () => true,
    build: () => ({
      id: 'charity-gala',
      title: 'Charity Gala Sponsorship',
      description:
        'A regional aviation-museum benefit is courting your airline as headline sponsor. The donation ' +
        'is real cash — but the photo ops in front of vintage aircraft would do wonders for your image.',
      options: [
        {
          label: 'Donate $30,000 (+8 reputation)',
          disabledReason: (st) => st.human.cash >= 30_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 30_000;
            st.human.reputation = Math.min(100, st.human.reputation + 8);
            st.pushNews(`★ ${st.human.name} headlined a charity gala — front-page goodwill, +8 reputation.`);
          },
        },
        {
          label: 'Skip the event (mild −1 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 1);
            st.pushNews(`${st.human.name} skipped the aviation charity gala — minor industry chatter.`);
          },
        },
      ],
    }),
  },

  // ----- Regulator audit: certain cost vs probabilistic fine. -----
  {
    id: 'regulator-audit',
    requires: (s) => s.stats.flights > 10,
    build: () => ({
      id: 'regulator-audit',
      title: 'Civil Aviation Regulator Audit',
      description:
        'A federal regulator wants to schedule a full operations audit. You can pay for expedited ' +
        'preparation and a clean process, or refuse and roll the dice — they\'ll find something, but ' +
        'it might be a minor finding instead of a major fine.',
      options: [
        {
          label: 'Pay for prep ($20,000, clean audit)',
          disabledReason: (st) => st.human.cash >= 20_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 20_000;
            st.pushNews(`${st.human.name} passed a regulator audit. No findings.`);
          },
        },
        {
          label: 'Refuse — gamble (50% chance of $50k fine + −5 rep)',
          apply: (st) => {
            if (Math.random() < 0.5) {
              st.human.cash -= 50_000;
              st.human.reputation = Math.max(0, st.human.reputation - 5);
              st.pushNews(`⚠ Regulator fined ${st.human.name} $50k — operational findings made public.`);
            } else {
              st.pushNews(`${st.human.name} dodged a regulator audit on a technicality.`);
            }
          },
        },
      ],
    }),
  },

  // ----- Rival poaching pilot: pay to retain or lose crew. -----
  {
    id: 'pilot-poaching',
    requires: (s) => s.human.pilots > 2,
    build: (s) => ({
      id: 'pilot-poaching',
      title: 'Rival Poaching Your Senior Pilot',
      description:
        `A competing airline has made a lateral offer to one of ${s.human.name}'s most experienced ` +
        `captains. You can counter with a retention bonus, or let them walk.`,
      options: [
        {
          label: 'Counter with retention bonus ($25,000)',
          disabledReason: (st) => st.human.cash >= 25_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 25_000;
            st.pushNews(`${st.human.name} matched a rival's poaching offer. Captain stays.`);
          },
        },
        {
          label: 'Let them go (−1 pilot, −2 reputation)',
          apply: (st) => {
            st.human.pilots = Math.max(0, st.human.pilots - 1);
            st.human.reputation = Math.max(0, st.human.reputation - 2);
            st.pushNews(`⚠ ${st.human.name} lost a senior captain to a rival. Crew morale takes a hit.`);
          },
        },
      ],
    }),
  },

  // ----- Regional festival surge: invest in marketing for revenue. -----
  {
    id: 'festival-surge',
    requires: (s) => s.human.routes.length > 0,
    build: () => ({
      id: 'festival-surge',
      title: 'Regional Festival Marketing Surge',
      description:
        'A regional cultural festival is driving a one-time spike in tourist demand. Marketing ' +
        'pitched an aggressive ad buy to capture the surge. They\'re asking for $15,000 to fund ' +
        'the campaign — expected upside is roughly $35,000 in incremental ticket revenue.',
      options: [
        {
          label: 'Fund the campaign ($15,000)',
          disabledReason: (st) => st.human.cash >= 15_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 15_000;
            // Ad-buy upside is variable — usually beats the spend, occasionally
            // it's a wash. Range $25k - $50k revenue.
            const surge = 25_000 + Math.floor(Math.random() * 25_000);
            st.human.cash += surge;
            st.pushNews(`${st.human.name}'s festival ad buy returned ${'$' + surge.toLocaleString('en-US')} in ticket revenue.`);
          },
        },
        {
          label: 'Skip the campaign',
          apply: (st) => {
            st.pushNews(`${st.human.name} skipped a regional festival ad opportunity. Rivals capitalized.`);
          },
        },
      ],
    }),
  },

  // ----- Stowaway discovered: pay or risk PR leak. -----
  {
    id: 'stowaway',
    requires: (s) => s.stats.flights > 3,
    build: () => ({
      id: 'stowaway',
      title: 'Stowaway Discovered',
      description:
        'Ground crew found a stowaway in a cargo hold during turnaround. They\'ve been detained ' +
        'and authorities notified. Internal review is one path — settle quietly and limit press ' +
        'exposure. Or you can let it run its course publicly.',
      options: [
        {
          label: 'Quiet settlement ($5,000)',
          disabledReason: (st) => st.human.cash >= 5_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 5_000;
            st.pushNews(`${st.human.name} handled a stowaway incident internally.`);
          },
        },
        {
          label: 'Let it run public (40% chance of −3 reputation)',
          apply: (st) => {
            if (Math.random() < 0.4) {
              st.human.reputation = Math.max(0, st.human.reputation - 3);
              st.pushNews(`⚠ Stowaway story embarrassed ${st.human.name}. Press carried it for a week.`);
            } else {
              st.pushNews(`${st.human.name}'s stowaway incident faded from the news cycle.`);
            }
          },
        },
      ],
    }),
  },

  // ----- VIP Lounge renovation: pay-for-rep investment. -----
  {
    id: 'lounge-renovation',
    requires: () => true,
    build: () => ({
      id: 'lounge-renovation',
      title: 'VIP Lounge Renovation Pitch',
      description:
        'Your interior-design firm has proposed a $40,000 refurbishment of the flagship VIP lounge — ' +
        'new espresso bar, recliners, runway view. Industry magazines have lined up coverage.',
      options: [
        {
          label: 'Approve renovation ($40,000, +6 rep)',
          disabledReason: (st) => st.human.cash >= 40_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 40_000;
            st.human.reputation = Math.min(100, st.human.reputation + 6);
            st.pushNews(`${st.human.name}'s renovated VIP lounge gets industry praise. +6 reputation.`);
          },
        },
        {
          label: 'Defer (no change)',
          apply: (st) => {
            st.pushNews(`${st.human.name} deferred the VIP lounge renovation. Designer offered the pitch to a rival.`);
          },
        },
      ],
    }),
  },

  // ----- Insurance premium hike: certain cost vs gambled negotiation. -----
  {
    id: 'insurance-hike',
    requires: (s) => s.human.planes.length > 0,
    build: () => ({
      id: 'insurance-hike',
      title: 'Insurance Premium Renewal',
      description:
        'Your aviation insurer wants to raise this year\'s premium by $30,000 citing fleet wear. ' +
        'You can accept the hike, or hire counsel to negotiate it down. Negotiation costs a $5,000 ' +
        'lawyer retainer either way; success is roughly a coin flip.',
      options: [
        {
          label: 'Accept the hike ($30,000)',
          disabledReason: (st) => st.human.cash >= 30_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 30_000;
            st.pushNews(`${st.human.name} renewed insurance — premium up $30k.`);
          },
        },
        {
          label: 'Negotiate (60% → $20k+$5k, 40% → $30k+$5k)',
          disabledReason: (st) => st.human.cash >= 35_000 ? null : 'Need $35k headroom to cover worst case.',
          apply: (st) => {
            st.human.cash -= 5_000;  // lawyer retainer always paid
            if (Math.random() < 0.6) {
              st.human.cash -= 20_000;
              st.pushNews(`${st.human.name}'s counsel negotiated the premium down. Net $25k spent (saved $5k).`);
            } else {
              st.human.cash -= 30_000;
              st.pushNews(`${st.human.name}'s negotiation failed. Full premium + lawyer = $35k spent.`);
            }
          },
        },
      ],
    }),
  },

  // ----- Local TV interview: probabilistic rep swing. -----
  {
    id: 'tv-interview',
    requires: () => true,
    build: () => ({
      id: 'tv-interview',
      title: 'Local TV Interview Request',
      description:
        'A regional news program wants a 10-minute live interview with the CEO. Live TV is high-' +
        'leverage — a good appearance pays in goodwill; a bad one rattles passengers. Your call.',
      options: [
        {
          label: 'Accept (70% → +6 rep, 30% → −3 rep)',
          apply: (st) => {
            if (Math.random() < 0.7) {
              st.human.reputation = Math.min(100, st.human.reputation + 6);
              st.pushNews(`★ ${st.human.name}'s CEO nailed the interview. +6 reputation.`);
            } else {
              st.human.reputation = Math.max(0, st.human.reputation - 3);
              st.pushNews(`⚠ ${st.human.name}'s CEO fumbled a live interview. −3 reputation.`);
            }
          },
        },
        {
          label: 'Decline politely (no effect)',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined a TV interview request.`);
          },
        },
      ],
    }),
  },

  // ----- Plane naming contest: cheap rep bump via PR. -----
  {
    id: 'naming-contest',
    requires: (s) => s.human.planes.length > 0,
    build: () => ({
      id: 'naming-contest',
      title: 'Plane Naming Contest',
      description:
        'Marketing wants to run a public contest where local schoolchildren name your next plane. ' +
        'Costs $10,000 to run; the resulting press cycle has historically been worth more than that ' +
        'in goodwill.',
      options: [
        {
          label: 'Run the contest ($10,000, +4 reputation)',
          disabledReason: (st) => st.human.cash >= 10_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 10_000;
            st.human.reputation = Math.min(100, st.human.reputation + 4);
            st.pushNews(`${st.human.name} ran a plane-naming contest — heartwarming local press. +4 reputation.`);
          },
        },
        {
          label: 'Pass',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined a plane-naming contest pitch.`);
          },
        },
      ],
    }),
  },

  // ----- Cargo pilfering scandal: severance vs investigative path. -----
  {
    id: 'pilfering-scandal',
    requires: (s) => s.stats.flights > 5,
    build: () => ({
      id: 'pilfering-scandal',
      title: 'Cargo Pilfering Allegations',
      description:
        'Internal audit flagged a pattern of high-value items disappearing in transit. Two ground ' +
        'crew are implicated. You can settle quietly with severance and a non-disclosure, or open a ' +
        'full investigation. The investigation is free but the story tends to leak.',
      options: [
        {
          label: 'Quiet severance ($20,000)',
          disabledReason: (st) => st.human.cash >= 20_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 20_000;
            st.pushNews(`${st.human.name} settled cargo pilfering allegations privately.`);
          },
        },
        {
          label: 'Open investigation (−3 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 3);
            st.pushNews(`⚠ ${st.human.name}'s cargo pilfering investigation leaked. −3 reputation.`);
          },
        },
      ],
    }),
  },

  // ----- Industry conference invite: pay to attend, gain industry pull. -----
  {
    id: 'industry-conference',
    requires: (s) => s.stats.flights > 20,
    build: () => ({
      id: 'industry-conference',
      title: 'Industry Conference Keynote',
      description:
        'An industry trade group invited your CEO to deliver a keynote at their annual conference. ' +
        'Travel, prep, and sponsorship fees run $20,000. Attending the right rooms pays in industry ' +
        'goodwill and potential future deals.',
      options: [
        {
          label: 'Attend and keynote ($20,000, +5 reputation)',
          disabledReason: (st) => st.human.cash >= 20_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 20_000;
            st.human.reputation = Math.min(100, st.human.reputation + 5);
            st.pushNews(`${st.human.name}'s CEO keynoted a trade conference. +5 reputation.`);
          },
        },
        {
          label: 'Send regrets (no effect)',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined an industry conference keynote.`);
          },
        },
      ],
    }),
  },
];

let daysSinceLast = 0;
let pending: Intervention | null = null;

export function resetInterventions(): void {
  daysSinceLast = 0;
  pending = null;
}

/** Try to roll a new event today. Called from the daily hook. */
function maybeRollEvent(): void {
  const state = GameState.get();
  if (!state.settings.showInterventions) return;
  if (pending) return;  // existing one not yet shown
  daysSinceLast += 1;
  if (daysSinceLast < COOLDOWN_DAYS) return;
  if (Math.random() > DAILY_ROLL_CHANCE) return;

  const eligible = TEMPLATES.filter(t => t.requires(state));
  if (eligible.length === 0) return;
  const tpl = pick(eligible);
  pending = tpl.build(state);
  daysSinceLast = 0;
  // Subtle chime so the player notices the modal coming up — same family
  // as the sponsor offer ding so it reads as a "decision needed" beat.
  sound.play('sponsor');
}

export function consumePendingIntervention(): Intervention | null {
  const p = pending;
  pending = null;
  return p;
}

export function registerInterventionHooks(): void {
  clock.onDay(() => maybeRollEvent());
}
