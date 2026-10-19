// Shapes the package optimizer works with. Whole centimetres and grams everywhere; x runs along a carton's length,
// y along its width and z up from its floor.

// `flat`: a kit box lies on its largest face and only turns around the vertical axis (its face is never crushed);
// `any`: any of the six orientations.
export type PackOrientationMode = 'flat' | 'any';

// One physical unit to ship (an order line of quantity 3 is three units), as packed: its retail box plus wrapping.
export interface PackUnit {
  key: string;
  orderItemId: number;
  productId: number;
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGram: number;
  fragile: boolean;
  orientation: PackOrientationMode;
  valueVnd: number;
}

// A shipping carton of the shop's catalog. Inner dimensions hold the goods; outer dimensions are what the carrier
// measures.
export interface Carton {
  code: string;
  name: string;
  innerLengthCm: number;
  innerWidthCm: number;
  innerHeightCm: number;
  outerLengthCm: number;
  outerWidthCm: number;
  outerHeightCm: number;
  tareWeightGram: number;
  costVnd: number;
  maxLoadGram: number;
}

export interface Placement {
  key: string;
  x: number;
  y: number;
  z: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export type Dimensions = readonly [number, number, number];

// The orientations a unit may take, as [along x, along y, up], without duplicates (a cube has one).
export const orientations = (
  unit: Pick<PackUnit, 'lengthCm' | 'widthCm' | 'heightCm' | 'orientation'>,
): Dimensions[] => {
  const [a, b, c] = [unit.lengthCm, unit.widthCm, unit.heightCm].sort((p, q) => q - p);
  const all: Dimensions[] =
    unit.orientation === 'flat'
      ? [
          [a, b, c],
          [b, a, c],
        ]
      : [
          [a, b, c],
          [b, a, c],
          [a, c, b],
          [c, a, b],
          [b, c, a],
          [c, b, a],
        ];
  const seen = new Set<string>();
  return all.filter((dims) => {
    const key = dims.join('x');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// The unit as it goes into the carton: wrapped (bubble wrap) by `wrapCm` on every side.
export const wrapped = (unit: PackUnit, wrapCm: number): PackUnit => ({
  ...unit,
  lengthCm: unit.lengthCm + 2 * wrapCm,
  widthCm: unit.widthCm + 2 * wrapCm,
  heightCm: unit.heightCm + 2 * wrapCm,
});

// The space of a carton the goods may use: its inner size less the cushioning kept against every wall.
export const usableSpace = (carton: Carton, paddingCm: number): Dimensions => [
  carton.innerLengthCm - 2 * paddingCm,
  carton.innerWidthCm - 2 * paddingCm,
  carton.innerHeightCm - 2 * paddingCm,
];

export const volumeCm3 = (dims: Dimensions) => dims[0] * dims[1] * dims[2];

// The overlap of two intervals [a0, a1) and [b0, b1).
export const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
