import type { CandidatePlan, PlannedParcel } from './optimizer';
import type { PackingSettings } from './rules';

// The carrier's fee for a parcel (insurance included), or null when it does not serve the route. Comes from SuperAI
// quotes (or the local estimate); the domain never calls out.
export type FeeLookup = (billableWeightGram: number, parcel: PlannedParcel, index: number) => number | null;

export interface PlanTotals {
  // What the customer pays for delivery: the carrier fees.
  carrierFeeVnd: number;
  // The shop's own costs, used only to choose the plan.
  cartonVnd: number;
  handlingVnd: number;
  splitPenaltyVnd: number;
  totalVnd: number;
}

export interface PricedPlan {
  plan: CandidatePlan;
  carrierId: number | null;
  parcelFeesVnd: number[];
  totals: PlanTotals;
}

// Prices a plan with one carrier, or null when the carrier cannot carry one of its parcels.
export function pricePlan(
  plan: CandidatePlan,
  carrierId: number | null,
  fee: FeeLookup,
  settings: Pick<PackingSettings, 'handlingVndPerParcel' | 'splitPenaltyVnd'>,
): PricedPlan | null {
  const parcelFeesVnd: number[] = [];
  for (const [index, parcel] of plan.parcels.entries()) {
    const value = fee(parcel.billableWeightGram, parcel, index);
    if (value === null || !Number.isSafeInteger(value) || value < 0) return null;
    parcelFeesVnd.push(value);
  }
  const carrierFeeVnd = parcelFeesVnd.reduce((sum, value) => sum + value, 0);
  const cartonVnd = plan.parcels.reduce((sum, parcel) => sum + parcel.carton.costVnd, 0);
  const handlingVnd = settings.handlingVndPerParcel * plan.parcels.length;
  const splitPenaltyVnd = settings.splitPenaltyVnd * (plan.parcels.length - 1);
  return {
    plan,
    carrierId,
    parcelFeesVnd,
    totals: {
      carrierFeeVnd,
      cartonVnd,
      handlingVnd,
      splitPenaltyVnd,
      totalVnd: carrierFeeVnd + cartonVnd + handlingVnd + splitPenaltyVnd,
    },
  };
}

const outerVolume = (priced: PricedPlan) =>
  priced.plan.parcels.reduce(
    (sum, parcel) => sum + parcel.carton.outerLengthCm * parcel.carton.outerWidthCm * parcel.carton.outerHeightCm,
    0,
  );
const describe = (priced: PricedPlan) =>
  priced.plan.parcels
    .map(
      (parcel) =>
        `${parcel.carton.code}:${parcel.units
          .map((unit) => unit.key)
          .sort()
          .join(',')}`,
    )
    .sort()
    .join(';');

// Cheapest first; ties go to fewer parcels, then less carton volume, then a stable order (same input, same plan).
export const rankPlans = (plans: readonly PricedPlan[]) =>
  [...plans].sort(
    (a, b) =>
      a.totals.totalVnd - b.totals.totalVnd ||
      a.plan.parcels.length - b.plan.parcels.length ||
      outerVolume(a) - outerVolume(b) ||
      (a.carrierId ?? 0) - (b.carrierId ?? 0) ||
      describe(a).localeCompare(describe(b)),
  );
