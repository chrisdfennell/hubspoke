export type SponsorStatus = 'available' | 'active' | 'completed' | 'failed' | 'expired';

/**
 * A passenger-count goal offered by a sponsor brand. Layered on top of the
 * normal flight economy — every arrival of yours at the matching destination
 * city bumps `progress`; if you hit `target` before `deadlineDay` you collect
 * the reward, otherwise you fail and take a small reputation hit.
 *
 * Sponsors are a player-only mechanic right now — AI rivals don't accept
 * offers. The `ownerId` field is set when the human accepts so the daily
 * resolver can route the reward / penalty to the right player.
 */
export interface SponsorContract {
  id: string;
  /** Sponsor brand name (e.g., "Pacific Adventure Tours"). */
  brand: string;
  /** Flavor hook for the offer card (e.g., "is launching a tourism campaign"). */
  pitch: string;
  /** Destination city id. An arrival here counts toward progress. */
  toCity: string;
  /** Passengers needed to complete. */
  target: number;
  /** Passengers carried to `toCity` since acceptance. */
  progress: number;
  /** Game-day index when the offer expires unaccepted (used while status='available'). */
  offerExpiresOnDay: number;
  /** Game-day index when the contract deadline hits (used while status='active'). */
  deadlineDay: number;
  /** Cash paid out on completion. */
  reward: number;
  /** Reputation bonus on completion. */
  repReward: number;
  /** Reputation hit on failure. */
  repPenalty: number;
  status: SponsorStatus;
  /** Player id once accepted. */
  ownerId?: string;
}
