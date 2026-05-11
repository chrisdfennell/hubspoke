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
