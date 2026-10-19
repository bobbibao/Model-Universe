import type { PackOrientationMode } from './geometry';
import { DEFAULT_STACK_RULES } from './verify';

// One carrier's parcel limits. SuperAI quotes and books by weight only, so the shop computes the billable weight
// itself with the carrier's volumetric divisor; the carrier re-weighs and re-measures at pickup.
export interface CarrierParcelRule {
  maxWeightGram: number;
  maxSideCm: number;
  // Length + width + height of the outer carton.
  maxSumCm: number;
  volumetricDivisor: number;
  // False until staff confirm the numbers against the carrier contract (the admin page shows a warning).
  verified: boolean;
}

export interface PackingSettings {
  // Cushioning kept against every carton wall, and bubble wrap around every unit.
  paddingCm: number;
  wrapCm: number;
  minSupportRatio: number;
  maxStackLoadGram: number;
  // The shop's own cost per parcel (tape, wrap, labour) and the price of splitting an order (customers prefer one
  // parcel): both make an extra parcel worth it only when it really saves money.
  handlingVndPerParcel: number;
  splitPenaltyVnd: number;
  maxParcelsPerOrder: number;
  maxUnits: number;
}

// The packed size of a typical boxed kit per grade, used when a product has no packing size of its own.
export interface GradePackDefault {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGram: number;
  orientation: PackOrientationMode;
}

export interface PackingConfig {
  settings: PackingSettings;
  // By SuperAI carrier id ("10" SPX, "2" GHN, ...), and `default` for every other carrier.
  carriers: Record<string, CarrierParcelRule>;
  grades: Record<string, GradePackDefault>;
  // For a product with neither its own packing size nor a known grade (the plan is then marked as estimated).
  fallback: GradePackDefault;
}

// Conservative starting values. Carrier limits are not published by SuperAI: they are marked unverified until staff
// enter the numbers of the shop's SPX / SuperAI contract.
export const DEFAULT_PACKING_CONFIG: PackingConfig = {
  settings: {
    paddingCm: 2,
    wrapCm: 1,
    minSupportRatio: DEFAULT_STACK_RULES.minSupportRatio,
    maxStackLoadGram: DEFAULT_STACK_RULES.maxStackLoadGram,
    handlingVndPerParcel: 3_000,
    splitPenaltyVnd: 5_000,
    maxParcelsPerOrder: 4,
    maxUnits: 30,
  },
  carriers: {
    default: { maxWeightGram: 20_000, maxSideCm: 100, maxSumCm: 150, volumetricDivisor: 5000, verified: false },
    '10': { maxWeightGram: 20_000, maxSideCm: 100, maxSumCm: 150, volumetricDivisor: 6000, verified: false },
  },
  grades: {
    SD: { lengthCm: 19, widthCm: 12, heightCm: 6, weightGram: 150, orientation: 'flat' },
    EG: { lengthCm: 24, widthCm: 15, heightCm: 6, weightGram: 250, orientation: 'flat' },
    HG: { lengthCm: 32, widthCm: 20, heightCm: 8, weightGram: 400, orientation: 'flat' },
    RG: { lengthCm: 31, widthCm: 19, heightCm: 7, weightGram: 350, orientation: 'flat' },
    'RE/100': { lengthCm: 38, widthCm: 30, heightCm: 10, weightGram: 800, orientation: 'flat' },
    MG: { lengthCm: 38, widthCm: 30, heightCm: 11, weightGram: 900, orientation: 'flat' },
    MGSD: { lengthCm: 26, widthCm: 19, heightCm: 9, weightGram: 450, orientation: 'flat' },
    PG: { lengthCm: 59, widthCm: 41, heightCm: 17, weightGram: 3_000, orientation: 'flat' },
    OTHER: { lengthCm: 32, widthCm: 20, heightCm: 8, weightGram: 400, orientation: 'flat' },
  },
  fallback: { lengthCm: 35, widthCm: 25, heightCm: 10, weightGram: 600, orientation: 'flat' },
};

export const carrierRule = (config: PackingConfig, carrierId: number | string | null | undefined) =>
  config.carriers[String(carrierId ?? '')] ?? config.carriers.default;

const carton = (code: string, name: string, inner: [number, number, number], tareWeightGram: number) => ({
  code,
  name,
  innerLengthCm: inner[0],
  innerWidthCm: inner[1],
  innerHeightCm: inner[2],
  // 3-ply corrugated board: about 1 cm more on every side.
  outerLengthCm: inner[0] + 2,
  outerWidthCm: inner[1] + 2,
  outerHeightCm: inner[2] + 2,
  tareWeightGram,
  costVnd: 0,
  maxLoadGram: 20_000,
});

// A starting carton catalog sized around kit boxes (staff enter their real cartons and prices in admin).
export const DEFAULT_CARTONS = [
  carton('C-SD', 'Thùng nhỏ (SD)', [24, 17, 12], 120),
  carton('C-HG', 'Thùng 1 HG/RG', [38, 26, 14], 220),
  carton('C-HG2', 'Thùng 2 HG/RG', [38, 26, 26], 300),
  carton('C-MG', 'Thùng 1 MG', [46, 36, 17], 350),
  carton('C-MG3', 'Thùng nhiều MG', [46, 36, 36], 500),
  carton('C-PG', 'Thùng PG', [65, 47, 23], 650),
];

// A product's retail box as shipped (set by staff on the product); without it the grade default is used.
export interface ProductPackaging {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGram: number;
  fragile: boolean;
  orientation: PackOrientationMode;
}

const wholeIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

// Validates packaging sent by the admin form: null clears it; otherwise every size is a whole number in range.
export const parseProductPackaging = (raw: unknown): { value: ProductPackaging | null; error: string | null } => {
  if (raw === null) return { value: null, error: null };
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (![data.lengthCm, data.widthCm, data.heightCm].every((side) => wholeIn(side, 1, 200)))
    return { value: null, error: 'Packaging sides must be whole centimetres from 1 to 200.' };
  if (!wholeIn(data.weightGram, 1, 50_000))
    return { value: null, error: 'Packaging weight must be whole grams from 1 to 50,000.' };
  return {
    value: {
      lengthCm: data.lengthCm as number,
      widthCm: data.widthCm as number,
      heightCm: data.heightCm as number,
      weightGram: data.weightGram as number,
      fragile: data.fragile !== false,
      orientation: data.orientation === 'any' ? 'any' : 'flat',
    },
    error: null,
  };
};

// The packing size of a product: its own, else its grade's typical box, else the shop's fallback box. `source` tells
// staff how far to trust it (anything but `product` is an estimate worth measuring).
export const productPackaging = (
  config: PackingConfig,
  product: { packaging?: ProductPackaging | null; grade?: string | null },
): { packaging: ProductPackaging; source: 'product' | 'grade' | 'fallback' } => {
  if (product.packaging) return { packaging: product.packaging, source: 'product' };
  const grade = product.grade ? config.grades[product.grade] : undefined;
  if (grade) return { packaging: { ...grade, fragile: true }, source: 'grade' };
  return { packaging: { ...config.fallback, fragile: true }, source: 'fallback' };
};

// SuperAI's carrier ids (orders/price `carrier_id`), for naming carrier limits in admin.
export const SUPERAI_CARRIERS: Record<string, string> = {
  '2': 'GHN',
  '3': 'J&T Express',
  '4': 'Viettel Post',
  '6': 'BEST Express',
  '10': 'SPX Express',
  '13': 'VNPost',
};
