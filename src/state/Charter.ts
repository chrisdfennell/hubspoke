/**
 * A passenger-charter contract — paid one-shot flight from A to B with a
 * guaranteed pax count. Parallel to cargo: same status lifecycle, same
 * positioning-then-delivery flight model, but uses passenger seats and
 * pays a premium over the equivalent ticket revenue (real charter
 * customers pay for guaranteed seats + flexibility).
 *
 * Symmetric with cargo on dispatch — AI rivals can accept charters too,
 * scored by AI.aiBidCharter against their fleet's seat capacity and
 * range, gated by the same `aiCargoMinMargin` knob.
 */
export type CharterStatus = 'available' | 'active' | 'delivered' | 'failed';

export interface CharterContract {
  id: string;
  fromCity: string;
  toCity: string;
  /** Passengers to carry on the (one-way) charter leg. */
  paxCount: number;
  /** Cash paid out on delivery. */
  payment: number;
  /** Game-day index when an unfulfilled contract expires. */
  dueDay: number;
  /** Cash penalty on failure. */
  penalty: number;
  /** Reputation hit on failure. */
  repPenalty: number;
  status: CharterStatus;
  /** Acquiring player id (for active / delivered / failed). */
  ownerId?: string;
  /** Plane currently flying the contract, if dispatched. */
  assignedPlaneId?: string;
}
