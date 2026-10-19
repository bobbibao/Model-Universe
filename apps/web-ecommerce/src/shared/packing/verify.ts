import { overlap, type Dimensions, type PackUnit, type Placement } from './geometry';

// The physical rules of a packed carton, shared by the packer (while placing) and the verifier (afterwards).
export interface StackRules {
  // The share of a unit's base that must rest on the floor or on other units (no overhanging, tipping boxes).
  minSupportRatio: number;
  // The most weight that may rest, directly or through other units, on a fragile unit.
  maxStackLoadGram: number;
}

export const DEFAULT_STACK_RULES: StackRules = { minSupportRatio: 0.7, maxStackLoadGram: 3_000 };

const baseArea = (p: Placement) => p.lengthCm * p.widthCm;
const footprintOverlap = (a: Placement, b: Placement) =>
  overlap(a.x, a.x + a.lengthCm, b.x, b.x + b.lengthCm) * overlap(a.y, a.y + a.widthCm, b.y, b.y + b.widthCm);

// The placements directly under `p` (their tops touch its base) with the area each one carries.
export const supportsOf = (p: Placement, placed: readonly Placement[]) =>
  placed
    .filter((q) => q !== p && q.z + q.heightCm === p.z)
    .map((q) => ({ placement: q, area: footprintOverlap(p, q) }))
    .filter((row) => row.area > 0);

export const supportRatio = (p: Placement, placed: readonly Placement[]) =>
  p.z === 0 ? 1 : supportsOf(p, placed).reduce((sum, row) => sum + row.area, 0) / baseArea(p);

// The weight resting on every placement (by key): each unit passes its own weight plus its load down to the units
// under it, in proportion to the area each one carries.
export const stackLoads = (placed: readonly Placement[], weights: ReadonlyMap<string, number>) => {
  const loads = new Map<string, number>(placed.map((p) => [p.key, 0]));
  for (const p of [...placed].sort((a, b) => b.z - a.z || a.key.localeCompare(b.key))) {
    if (p.z === 0) continue;
    const supports = supportsOf(p, placed);
    const total = supports.reduce((sum, row) => sum + row.area, 0);
    const carried = (weights.get(p.key) ?? 0) + (loads.get(p.key) ?? 0);
    for (const row of supports)
      loads.set(row.placement.key, (loads.get(row.placement.key) ?? 0) + (carried * row.area) / total);
  }
  return loads;
};

const intersects = (a: Placement, b: Placement) =>
  overlap(a.x, a.x + a.lengthCm, b.x, b.x + b.lengthCm) > 0 &&
  overlap(a.y, a.y + a.widthCm, b.y, b.y + b.widthCm) > 0 &&
  overlap(a.z, a.z + a.heightCm, b.z, b.z + b.heightCm) > 0;

export const fitsInside = (p: Placement, space: Dimensions) =>
  p.x >= 0 &&
  p.y >= 0 &&
  p.z >= 0 &&
  p.x + p.lengthCm <= space[0] &&
  p.y + p.widthCm <= space[1] &&
  p.z + p.heightCm <= space[2];

export const collides = (p: Placement, placed: readonly Placement[]) => placed.some((q) => q !== p && intersects(p, q));

// Re-checks a packed carton from scratch: every unit placed exactly once in an allowed orientation, inside the usable
// space, without overlaps, supported, and no fragile unit carrying too much. Returns the first problem, or null.
// Every plan passes through it, so a packer bug can never produce a physically impossible plan.
export function verifyPlacements(
  placements: readonly Placement[],
  units: readonly PackUnit[],
  space: Dimensions,
  rules: StackRules,
): string | null {
  const byKey = new Map(units.map((unit) => [unit.key, unit]));
  if (placements.length !== units.length || new Set(placements.map((p) => p.key)).size !== units.length)
    return 'Every unit must be placed exactly once.';
  for (const p of placements) {
    const unit = byKey.get(p.key);
    if (!unit) return `Unknown unit ${p.key}.`;
    const given = [p.lengthCm, p.widthCm, p.heightCm].sort((a, b) => a - b).join('x');
    const actual = [unit.lengthCm, unit.widthCm, unit.heightCm].sort((a, b) => a - b).join('x');
    if (given !== actual) return `Unit ${p.key} changed size.`;
    if (unit.orientation === 'flat' && p.heightCm !== Math.min(unit.lengthCm, unit.widthCm, unit.heightCm))
      return `Unit ${p.key} must lie flat.`;
    if (!fitsInside(p, space)) return `Unit ${p.key} is outside the carton.`;
    if (collides(p, placements)) return `Unit ${p.key} overlaps another unit.`;
    if (supportRatio(p, placements) < rules.minSupportRatio) return `Unit ${p.key} is not supported.`;
  }
  const loads = stackLoads(placements, new Map(units.map((unit) => [unit.key, unit.weightGram])));
  for (const unit of units)
    if (unit.fragile && (loads.get(unit.key) ?? 0) > rules.maxStackLoadGram) return `Unit ${unit.key} is crushed.`;
  return null;
}
