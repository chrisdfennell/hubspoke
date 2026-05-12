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

  // ===== SAFETY / OPS =====

  // ----- Cabin fire drill training: cheap preventative or risk PR hit. -----
  {
    id: 'cabin-fire-drill',
    requires: (s) => s.human.planes.length > 0,
    build: () => ({
      id: 'cabin-fire-drill',
      title: 'Cabin Fire Drill Training',
      description:
        'Operations recommends a paid certification refresh on cabin emergency drills. Costs $8,000 ' +
        'to run; passing on it means your crew is rolling slightly worn certifications, with mild ' +
        'reputation downside if anything goes wrong publicly.',
      options: [
        {
          label: 'Fund the training ($8,000)',
          disabledReason: (st) => st.human.cash >= 8_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 8_000;
            st.pushNews(`${st.human.name} certified cabin crew on the latest emergency drills.`);
          },
        },
        {
          label: 'Skip the refresh (small −2 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 2);
            st.pushNews(`${st.human.name} skipped a cabin drill refresh. Industry observers noted the lapse.`);
          },
        },
      ],
    }),
  },

  // ----- Bird strike damage: pay or risk plane condition. -----
  {
    id: 'bird-strike',
    requires: (s) => s.human.planes.length > 0,
    build: (s) => {
      const plane = pick(s.human.planes);
      return {
        id: 'bird-strike',
        title: 'Bird Strike Damage Report',
        description:
          `A flock strike on ${plane.name} during approach left visible nacelle damage. Pay for ` +
          `emergency repair now, or defer the work and accept the wear.`,
        options: [
          {
            label: 'Emergency repair ($15,000)',
            disabledReason: (st) => st.human.cash >= 15_000 ? null : 'Not enough cash.',
            apply: (st) => {
              st.human.cash -= 15_000;
              st.pushNews(`Workshop repaired bird-strike damage on ${plane.name}.`);
            },
          },
          {
            label: 'Defer the work (plane condition −10%)',
            apply: (st) => {
              plane.condition = Math.max(0.10, plane.condition - 0.10);
              st.pushNews(`${st.human.name} deferred bird-strike repair on ${plane.name}. Condition down 10%.`);
            },
          },
        ],
        footer: (st) => `${plane.name} condition: ${Math.round(plane.condition * 100)}%   ·   Cash: ${formatMoney(st.human.cash)}`,
      };
    },
  },

  // ----- Weather delay compensation: pay or take rep hit. -----
  {
    id: 'weather-delay',
    requires: (s) => s.stats.flights > 5,
    build: () => ({
      id: 'weather-delay',
      title: 'Weather Delay Compensation',
      description:
        'A storm system stranded passengers across two hubs overnight. Industry practice is to issue ' +
        'goodwill vouchers and hotel reimbursements. You can fund the program or stick to the legal ' +
        'minimum and absorb the press cycle.',
      options: [
        {
          label: 'Fund goodwill vouchers ($20,000)',
          disabledReason: (st) => st.human.cash >= 20_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 20_000;
            st.pushNews(`${st.human.name} issued storm-delay vouchers — passengers thanked publicly.`);
          },
        },
        {
          label: 'Stick to legal minimum (−4 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 4);
            st.pushNews(`⚠ ${st.human.name} declined storm-delay goodwill. Passenger complaints made the news.`);
          },
        },
      ],
    }),
  },

  // ===== HR / CREW =====

  // ----- Mechanics union grievance: bonus or reputation hit. -----
  {
    id: 'mechanics-grievance',
    requires: (s) => s.human.mechanics > 0,
    build: () => ({
      id: 'mechanics-grievance',
      title: "Mechanics' Union Grievance",
      description:
        'The mechanics filed a formal grievance over rotating-shift scheduling. A one-time appreciation ' +
        'bonus would settle the matter; refusing keeps cash on hand but the morale hit will show.',
      options: [
        {
          label: 'Pay the bonus ($12,000)',
          disabledReason: (st) => st.human.cash >= 12_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 12_000;
            st.pushNews(`${st.human.name} settled a mechanics' grievance with a $12k bonus.`);
          },
        },
        {
          label: 'Refuse (−3 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 3);
            st.pushNews(`⚠ ${st.human.name} rejected a mechanics' grievance. Morale takes a hit.`);
          },
        },
      ],
    }),
  },

  // ----- Pilot fatigue lawsuit: settle or litigate. -----
  {
    id: 'pilot-fatigue-suit',
    requires: (s) => s.human.pilots > 1 && s.stats.flights > 25,
    build: () => ({
      id: 'pilot-fatigue-suit',
      title: 'Pilot Fatigue Lawsuit',
      description:
        'A former captain filed suit alleging fatigue-related scheduling violations. Settlement ' +
        'gets you out at $30,000. Litigating is cheaper if you win — but losing costs $80,000.',
      options: [
        {
          label: 'Settle ($30,000)',
          disabledReason: (st) => st.human.cash >= 30_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 30_000;
            st.pushNews(`${st.human.name} settled a pilot fatigue suit out of court for $30k.`);
          },
        },
        {
          label: 'Litigate (60% win $0, 40% lose $80,000)',
          disabledReason: (st) => st.human.cash >= 80_000 ? null : 'Need $80k headroom to cover loss.',
          apply: (st) => {
            if (Math.random() < 0.6) {
              st.pushNews(`★ ${st.human.name} won a fatigue-suit dismissal at trial — no payout.`);
            } else {
              st.human.cash -= 80_000;
              st.pushNews(`⚠ ${st.human.name} lost a fatigue suit at trial — $80k payout.`);
            }
          },
        },
      ],
    }),
  },

  // ----- Flight attendant strike threat: pay or risk -----
  {
    id: 'fa-strike',
    requires: (s) => s.stats.flights > 5,
    build: () => ({
      id: 'fa-strike',
      title: 'Flight Attendant Strike Threat',
      description:
        'The flight attendants are voting on a one-day walkout next week. A pre-emptive bonus payment ' +
        'usually defuses these. Refusing rolls the dice.',
      options: [
        {
          label: 'Pre-emptive bonus ($18,000)',
          disabledReason: (st) => st.human.cash >= 18_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 18_000;
            st.pushNews(`${st.human.name} averted a flight-attendant walkout with a bonus.`);
          },
        },
        {
          label: 'Refuse — 50% chance of one-day strike (−5 rep)',
          apply: (st) => {
            if (Math.random() < 0.5) {
              st.human.reputation = Math.max(0, st.human.reputation - 5);
              st.pushNews(`⚠ Flight attendants walked out for a day at ${st.human.name}. −5 reputation.`);
            } else {
              st.pushNews(`${st.human.name} called the strike bluff — vote failed.`);
            }
          },
        },
      ],
    }),
  },

  // ----- Crew uniforms redesign: invest for rep. -----
  {
    id: 'uniform-redesign',
    requires: (s) => s.human.pilots > 0,
    build: () => ({
      id: 'uniform-redesign',
      title: 'Crew Uniform Redesign',
      description:
        'A boutique design house pitched a refresh of cabin and ground-crew uniforms. The new look ' +
        'plays well in marketing photos — staff morale and brand both benefit.',
      options: [
        {
          label: 'Commission the redesign ($15,000)',
          disabledReason: (st) => st.human.cash >= 15_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 15_000;
            st.human.reputation = Math.min(100, st.human.reputation + 4);
            st.pushNews(`${st.human.name}'s new crew uniforms got industry magazine coverage. +4 rep.`);
          },
        },
        {
          label: 'Stick with current uniforms',
          apply: (st) => {
            st.pushNews(`${st.human.name} passed on a uniform redesign pitch.`);
          },
        },
      ],
    }),
  },

  // ===== MARKETING / BRAND =====

  // ----- Sports team sponsorship: bigger spend for bigger rep. -----
  {
    id: 'sports-sponsor',
    requires: (s) => s.stats.flights > 15,
    build: () => ({
      id: 'sports-sponsor',
      title: 'Sports Team Sponsorship',
      description:
        'A regional football team is looking for an official airline partner. The deal is $35,000 ' +
        'for jersey placement and seat-back ads. Game-day visibility lifts brand recognition.',
      options: [
        {
          label: 'Sign the deal ($35,000, +6 reputation)',
          disabledReason: (st) => st.human.cash >= 35_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 35_000;
            st.human.reputation = Math.min(100, st.human.reputation + 6);
            st.pushNews(`${st.human.name} signed on as airline sponsor of a regional team. +6 rep.`);
          },
        },
        {
          label: 'Pass on the deal',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined a sports sponsorship offer.`);
          },
        },
      ],
    }),
  },

  // ----- Trade show booth: small spend, small rep. -----
  {
    id: 'trade-show',
    requires: () => true,
    build: () => ({
      id: 'trade-show',
      title: 'Trade Show Booth',
      description:
        'A regional travel-industry trade show is courting exhibitors. A modest booth presence costs ' +
        '$12,000 and reliably builds industry connections.',
      options: [
        {
          label: 'Book a booth ($12,000, +3 reputation)',
          disabledReason: (st) => st.human.cash >= 12_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 12_000;
            st.human.reputation = Math.min(100, st.human.reputation + 3);
            st.pushNews(`${st.human.name} exhibited at a travel trade show. +3 rep.`);
          },
        },
        {
          label: 'Skip the show',
          apply: (st) => {
            st.pushNews(`${st.human.name} skipped a regional trade show.`);
          },
        },
      ],
    }),
  },

  // ----- Influencer partnership: gamble. -----
  {
    id: 'influencer',
    requires: (s) => s.stats.flights > 5,
    build: () => ({
      id: 'influencer',
      title: 'Travel Influencer Partnership',
      description:
        'A travel-content creator with 2M followers wants a paid partnership — fly her on a free ' +
        'route in exchange for a video review. Most posts do well; some backfire spectacularly.',
      options: [
        {
          label: 'Sign the deal ($10,000) — 60% +4 rep, 40% −2 rep',
          disabledReason: (st) => st.human.cash >= 10_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 10_000;
            if (Math.random() < 0.6) {
              st.human.reputation = Math.min(100, st.human.reputation + 4);
              st.pushNews(`${st.human.name}'s influencer video went viral in a good way. +4 rep.`);
            } else {
              st.human.reputation = Math.max(0, st.human.reputation - 2);
              st.pushNews(`⚠ The influencer's review trashed ${st.human.name}. −2 rep.`);
            }
          },
        },
        {
          label: 'Decline',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined an influencer partnership offer.`);
          },
        },
      ],
    }),
  },

  // ----- Loyalty program launch: big invest for big rep. -----
  {
    id: 'loyalty-program',
    requires: (s) => s.human.routes.length >= 3,
    build: () => ({
      id: 'loyalty-program',
      title: 'Frequent-Flyer Program Launch',
      description:
        'Marketing pitched a full-fledged miles + status loyalty program. Launch costs are real but ' +
        'a successful program builds repeat customers and long-term brand equity.',
      options: [
        {
          label: 'Launch the program ($50,000, +8 reputation)',
          disabledReason: (st) => st.human.cash >= 50_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 50_000;
            st.human.reputation = Math.min(100, st.human.reputation + 8);
            st.pushNews(`★ ${st.human.name} launched a frequent-flyer program. +8 reputation.`);
          },
        },
        {
          label: 'Hold off',
          apply: (st) => {
            st.pushNews(`${st.human.name} deferred a loyalty program launch.`);
          },
        },
      ],
    }),
  },

  // ===== FINANCE =====

  // ----- Tax audit: pay accountant or gamble. -----
  {
    id: 'tax-audit',
    requires: (s) => s.stats.flights > 20,
    build: () => ({
      id: 'tax-audit',
      title: 'Corporate Tax Audit',
      description:
        'The tax authority opened a routine audit. You can retain an accountant to walk through the ' +
        'books cleanly, or handle it in-house and accept whatever findings come up.',
      options: [
        {
          label: 'Retain accountant ($15,000, clean audit)',
          disabledReason: (st) => st.human.cash >= 15_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 15_000;
            st.pushNews(`${st.human.name} passed a tax audit cleanly with retained counsel.`);
          },
        },
        {
          label: 'Handle in-house (50% chance of $25k fine)',
          apply: (st) => {
            if (Math.random() < 0.5) {
              st.human.cash -= 25_000;
              st.pushNews(`⚠ Tax audit fined ${st.human.name} $25k for filing irregularities.`);
            } else {
              st.pushNews(`${st.human.name} passed a tax audit on internal records.`);
            }
          },
        },
      ],
    }),
  },

  // ===== INDUSTRY =====

  // ----- Aviation magazine cover: cheap rep bump. -----
  {
    id: 'magazine-cover',
    requires: (s) => s.stats.flights > 10,
    build: () => ({
      id: 'magazine-cover',
      title: 'Aviation Magazine Cover',
      description:
        'A major aviation-trade magazine wants to put your CEO on next month\'s cover. Editorial is ' +
        'free; they\'re asking for $5,000 to subsidize a longer photo shoot. Tiny spend, real exposure.',
      options: [
        {
          label: 'Cover the photo shoot ($5,000, +5 reputation)',
          disabledReason: (st) => st.human.cash >= 5_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 5_000;
            st.human.reputation = Math.min(100, st.human.reputation + 5);
            st.pushNews(`${st.human.name} made the cover of an aviation trade magazine. +5 rep.`);
          },
        },
        {
          label: 'Pass on the cover',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined a magazine cover photo shoot.`);
          },
        },
      ],
    }),
  },

  // ----- Airline alliance invite: prestige spend. -----
  {
    id: 'alliance-invite',
    requires: (s) => s.human.hubs.length > 1,
    build: () => ({
      id: 'alliance-invite',
      title: 'Airline Alliance Invitation',
      description:
        'A global airline alliance is extending an invitation to join. Membership dues are steep, ' +
        'but alliance affiliation is a prestige marker — and unlocks future codeshare possibilities.',
      options: [
        {
          label: 'Join the alliance ($30,000, +7 reputation)',
          disabledReason: (st) => st.human.cash >= 30_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 30_000;
            st.human.reputation = Math.min(100, st.human.reputation + 7);
            st.pushNews(`★ ${st.human.name} joined a global airline alliance. +7 reputation.`);
          },
        },
        {
          label: 'Decline membership',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined an alliance invitation.`);
          },
        },
      ],
    }),
  },

  // ===== MAINTENANCE / FLEET =====

  // ----- Wing inspection program: preventative vs gamble. -----
  {
    id: 'wing-inspection',
    requires: (s) => s.human.planes.length > 0,
    build: (s) => {
      const plane = pick(s.human.planes);
      return {
        id: 'wing-inspection',
        title: 'Preventative Wing Inspection',
        description:
          `Maintenance recommends a preventative wing-spar inspection across the fleet. Skipping ` +
          `the program is fine most of the time — but the next time a stress crack is missed, the ` +
          `repair bill is much worse.`,
        options: [
          {
            label: 'Run the program ($15,000)',
            disabledReason: (st) => st.human.cash >= 15_000 ? null : 'Not enough cash.',
            apply: (st) => {
              st.human.cash -= 15_000;
              st.pushNews(`${st.human.name} completed preventative wing inspections. No findings.`);
            },
          },
          {
            label: `Skip the program (${plane.name} condition −10%)`,
            apply: (st) => {
              plane.condition = Math.max(0.10, plane.condition - 0.10);
              st.pushNews(`⚠ ${st.human.name} skipped wing inspections. ${plane.name} took the hit.`);
            },
          },
        ],
      };
    },
  },

  // ===== PUBLIC RELATIONS =====

  // ----- Customer complaint storm: damage control. -----
  {
    id: 'complaint-storm',
    requires: (s) => s.stats.passengers > 5_000,
    build: () => ({
      id: 'complaint-storm',
      title: 'Customer Complaint Storm',
      description:
        'A viral thread by a delayed passenger has snowballed into a wave of complaints on social ' +
        'media. A coordinated apology campaign can defuse it; ignoring it lets the cycle play out.',
      options: [
        {
          label: 'Apology campaign ($5,000)',
          disabledReason: (st) => st.human.cash >= 5_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 5_000;
            st.pushNews(`${st.human.name} responded to a complaint storm with a coordinated apology.`);
          },
        },
        {
          label: 'Ride it out (−3 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 3);
            st.pushNews(`⚠ ${st.human.name}'s complaint storm went unanswered. −3 reputation.`);
          },
        },
      ],
    }),
  },

  // ----- Lost luggage policy: invest in goodwill. -----
  {
    id: 'lost-luggage',
    requires: (s) => s.stats.flights > 10,
    build: () => ({
      id: 'lost-luggage',
      title: 'Lost Luggage Policy Overhaul',
      description:
        'Customer-relations pitched a generous new lost-baggage compensation policy. Implementation ' +
        'costs are real but the goodwill compounds across thousands of future passengers.',
      options: [
        {
          label: 'Implement the policy ($10,000, +3 reputation)',
          disabledReason: (st) => st.human.cash >= 10_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 10_000;
            st.human.reputation = Math.min(100, st.human.reputation + 3);
            st.pushNews(`${st.human.name} rolled out a generous lost-baggage policy. +3 rep.`);
          },
        },
        {
          label: 'Keep the current policy',
          apply: (st) => {
            st.pushNews(`${st.human.name} kept the existing lost-baggage policy in place.`);
          },
        },
      ],
    }),
  },

  // ----- Holiday surge pricing scandal: refund or absorb hit. -----
  {
    id: 'surge-pricing',
    requires: (s) => s.stats.flights > 10,
    build: () => ({
      id: 'surge-pricing',
      title: 'Holiday Surge Pricing Scandal',
      description:
        'Press reports painted your holiday-period fares as predatory. A voluntary partial refund ' +
        'program defuses the story; sticking to the algorithm rides out a rough press cycle.',
      options: [
        {
          label: 'Issue refunds ($20,000)',
          disabledReason: (st) => st.human.cash >= 20_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 20_000;
            st.pushNews(`${st.human.name} refunded $20k of holiday-fare surge charges. Press cycle reversed.`);
          },
        },
        {
          label: 'Stand by the prices (−3 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 3);
            st.pushNews(`⚠ ${st.human.name} defended holiday surge pricing. −3 reputation.`);
          },
        },
      ],
    }),
  },

  // ----- Corporate documentary: free PR, but commit to access. -----
  {
    id: 'documentary',
    requires: (s) => s.stats.flights > 30,
    build: () => ({
      id: 'documentary',
      title: 'Streaming Documentary Series',
      description:
        'A streaming service is producing an industry documentary and wants behind-the-scenes ' +
        'access to your operations. No money changes hands either way — but refusing reads as ' +
        'secretive in the press.',
      options: [
        {
          label: 'Grant filming access (+3 reputation)',
          apply: (st) => {
            st.human.reputation = Math.min(100, st.human.reputation + 3);
            st.pushNews(`${st.human.name} gave behind-the-scenes access to a streaming doc. +3 rep.`);
          },
        },
        {
          label: 'Refuse access (−1 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 1);
            st.pushNews(`${st.human.name} refused documentary access. Press noted the secrecy.`);
          },
        },
      ],
    }),
  },

  // ===== FLAVOR / MISC =====

  // ----- Earthquake terminal damage: pay or lose face. -----
  {
    id: 'earthquake-damage',
    requires: (s) => s.stats.flights > 5,
    build: () => ({
      id: 'earthquake-damage',
      title: 'Terminal Earthquake Damage',
      description:
        'A minor quake near one of your hubs cracked terminal jet-bridge supports. Immediate repair ' +
        'is $30,000 and keeps operations clean; delaying means visible scaffolding and a reputational hit.',
      options: [
        {
          label: 'Immediate repair ($30,000)',
          disabledReason: (st) => st.human.cash >= 30_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 30_000;
            st.pushNews(`${st.human.name} repaired quake-damaged jet bridges quickly.`);
          },
        },
        {
          label: 'Delay the work (−5 reputation)',
          apply: (st) => {
            st.human.reputation = Math.max(0, st.human.reputation - 5);
            st.pushNews(`⚠ ${st.human.name}'s damaged jet bridges drew bad press. −5 reputation.`);
          },
        },
      ],
    }),
  },

  // ----- Whistleblower bounty program: invest in culture. -----
  {
    id: 'whistleblower-program',
    requires: (s) => s.stats.flights > 25,
    build: () => ({
      id: 'whistleblower-program',
      title: 'Internal Ethics Program',
      description:
        'HR pitched establishing a formal internal whistleblower bounty + ethics review program. ' +
        'Launch costs are real but the message it sends — both internally and to the press — is ' +
        'durable.',
      options: [
        {
          label: 'Establish the program ($20,000, +5 reputation)',
          disabledReason: (st) => st.human.cash >= 20_000 ? null : 'Not enough cash.',
          apply: (st) => {
            st.human.cash -= 20_000;
            st.human.reputation = Math.min(100, st.human.reputation + 5);
            st.pushNews(`${st.human.name} launched an internal ethics program. +5 reputation.`);
          },
        },
        {
          label: 'Hold off',
          apply: (st) => {
            st.pushNews(`${st.human.name} declined an internal ethics program proposal.`);
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
