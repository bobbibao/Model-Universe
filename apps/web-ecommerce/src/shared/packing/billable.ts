import type { Carton } from './geometry';
import type { CarrierParcelRule } from './rules';

export interface ParcelWeights {
  actualWeightGram: number;
  volumetricWeightGram: number;
  billableWeightGram: number;
}

// What the carrier charges for: the larger of the real weight (goods + carton) and the volumetric weight of the outer
// carton (L×W×H cm³ / divisor kg, in grams, rounded up).
export const parcelWeights = (carton: Carton, contentsGram: number, divisor: number): ParcelWeights => {
  const actualWeightGram = contentsGram + carton.tareWeightGram;
  const volumetricWeightGram = Math.ceil(
    (carton.outerLengthCm * carton.outerWidthCm * carton.outerHeightCm * 1000) / divisor,
  );
  return {
    actualWeightGram,
    volumetricWeightGram,
    billableWeightGram: Math.max(actualWeightGram, volumetricWeightGram),
  };
};

// Why the carrier would refuse this parcel, or null when it is within its limits.
export const carrierLimitProblem = (carton: Carton, actualWeightGram: number, rule: CarrierParcelRule) => {
  const sides = [carton.outerLengthCm, carton.outerWidthCm, carton.outerHeightCm];
  if (actualWeightGram > rule.maxWeightGram) return 'OVER_WEIGHT' as const;
  if (Math.max(...sides) > rule.maxSideCm) return 'OVER_SIDE' as const;
  if (sides.reduce((sum, side) => sum + side, 0) > rule.maxSumCm) return 'OVER_SIZE_SUM' as const;
  return null;
};
