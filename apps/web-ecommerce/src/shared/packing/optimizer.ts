import { carrierLimitProblem, parcelWeights, type ParcelWeights } from './billable';
import { packCarton } from './extremePoint';
import { usableSpace, wrapped, type Carton, type PackUnit, type Placement } from './geometry';
import type { CarrierParcelRule, PackingSettings } from './rules';

export const PACKING_ALGORITHM_VERSION = 'ep-1';

// One parcel of a plan: its carton, the (wrapped) units in it and where each one goes, and what the carrier bills.
export interface PlannedParcel extends ParcelWeights {
  carton: Carton;
  units: PackUnit[];
  placements: Placement[];
  declaredValueVnd: number;
}

export interface CandidatePlan {
  parcels: PlannedParcel[];
}

// NO_FIT: the units need more parcels than an order may have.
export type PlanProblemCode = 'NO_UNITS' | 'TOO_MANY_UNITS' | 'NO_CARTONS' | 'OVERSIZE' | 'NO_FIT';
export interface PlanProblem {
  code: PlanProblemCode;
  unitKeys: string[];
}

// Every way to split the units into parcels is tried up to this many units (Bell(8) = 4,140 splits); larger orders use
// greedy heuristics.
const EXACT_UNITS = 8;

const unitSignature = (unit: PackUnit) =>
  `${unit.productId}:${unit.lengthCm}x${unit.widthCm}x${unit.heightCm}:${unit.weightGram}:${unit.orientation}:${unit.fragile ? 1 : 0}`;
// Units of the same product are interchangeable: a group is identified by its unit signatures, so packing results are
// shared between groups that only differ by which identical unit they hold.
const groupSignature = (units: readonly PackUnit[]) => units.map(unitSignature).sort().join('|');
const unitVolume = (unit: PackUnit) => unit.lengthCm * unit.widthCm * unit.heightCm;

type PackedGroup = Omit<PlannedParcel, 'units' | 'declaredValueVnd'> & { source: Map<string, string> };

// Packs one group of units into the carton the carrier bills least for (lowest billable weight, then the cheaper,
// then the smaller carton) that holds them physically and stays within the carrier's limits. Memoised per group.
export function makeGroupPacker(cartons: readonly Carton[], rule: CarrierParcelRule, settings: PackingSettings) {
  const ranked = [...cartons].sort(
    (a, b) =>
      parcelWeights(a, 0, rule.volumetricDivisor).billableWeightGram -
        parcelWeights(b, 0, rule.volumetricDivisor).billableWeightGram ||
      a.costVnd - b.costVnd ||
      a.outerLengthCm * a.outerWidthCm * a.outerHeightCm - b.outerLengthCm * b.outerWidthCm * b.outerHeightCm ||
      a.code.localeCompare(b.code),
  );
  const stack = { minSupportRatio: settings.minSupportRatio, maxStackLoadGram: settings.maxStackLoadGram };
  const memo = new Map<string, PackedGroup | null>();
  return (units: readonly PackUnit[]): PlannedParcel | null => {
    const key = groupSignature(units);
    if (!memo.has(key)) {
      const contents = units.reduce((sum, unit) => sum + unit.weightGram, 0);
      const volume = units.reduce((sum, unit) => sum + unitVolume(unit), 0);
      let found: PackedGroup | null = null;
      for (const carton of ranked) {
        const space = usableSpace(carton, settings.paddingCm);
        if (space.some((side) => side <= 0) || space[0] * space[1] * space[2] < volume) continue;
        if (contents > carton.maxLoadGram) continue;
        const weights = parcelWeights(carton, contents, rule.volumetricDivisor);
        if (carrierLimitProblem(carton, weights.actualWeightGram, rule)) continue;
        if (
          found &&
          (weights.billableWeightGram > found.billableWeightGram ||
            (weights.billableWeightGram === found.billableWeightGram && carton.costVnd >= found.carton.costVnd))
        )
          continue;
        const placements = packCarton(units, space, stack);
        if (!placements) continue;
        found = {
          carton,
          placements,
          ...weights,
          source: new Map(units.map((unit) => [unit.key, unitSignature(unit)])),
        };
      }
      memo.set(key, found);
    }
    const hit = memo.get(key);
    if (!hit) return null;
    // The remembered placements name the units of the first group packed: give each slot to a unit of these units with
    // the same signature.
    const free = new Map<string, string[]>();
    for (const unit of [...units].sort((a, b) => a.key.localeCompare(b.key)))
      free.set(unitSignature(unit), [...(free.get(unitSignature(unit)) ?? []), unit.key]);
    const placements = hit.placements.map((placement) => ({
      ...placement,
      key: free.get(hit.source.get(placement.key)!)!.shift()!,
    }));
    return {
      carton: hit.carton,
      actualWeightGram: hit.actualWeightGram,
      volumetricWeightGram: hit.volumetricWeightGram,
      billableWeightGram: hit.billableWeightGram,
      placements,
      units: [...units],
      declaredValueVnd: units.reduce((sum, unit) => sum + unit.valueVnd, 0),
    };
  };
}

// Every split of `items` into at most `maxBlocks` non-empty groups (restricted growth strings).
function* partitions<T>(items: readonly T[], maxBlocks: number): Generator<T[][]> {
  const assignment = new Array<number>(items.length).fill(0);
  function* walk(index: number, blocks: number): Generator<T[][]> {
    if (index === items.length) {
      const groups: T[][] = Array.from({ length: blocks }, () => []);
      items.forEach((item, i) => groups[assignment[i]].push(item));
      yield groups;
      return;
    }
    for (let block = 0; block <= Math.min(blocks, maxBlocks - 1); block++) {
      assignment[index] = block;
      yield* walk(index + 1, Math.max(blocks, block + 1));
    }
  }
  yield* walk(0, 0);
}

const planKey = (plan: CandidatePlan) =>
  plan.parcels
    .map((parcel) => `${parcel.carton.code}:${parcel.billableWeightGram}:${groupSignature(parcel.units)}`)
    .sort()
    .join(';');

// The feasible ways to pack an order's units for one carrier: which units go together and in which carton. Every
// returned plan is physically verified and within the carrier's limits; pricing (cost.ts) chooses among them.
export function candidatePlans(
  units: readonly PackUnit[],
  cartons: readonly Carton[],
  rule: CarrierParcelRule,
  settings: PackingSettings,
): { plans: CandidatePlan[]; problem: PlanProblem | null } {
  if (!units.length) return { plans: [], problem: { code: 'NO_UNITS', unitKeys: [] } };
  if (units.length > settings.maxUnits)
    return { plans: [], problem: { code: 'TOO_MANY_UNITS', unitKeys: units.map((unit) => unit.key) } };
  if (!cartons.length) return { plans: [], problem: { code: 'NO_CARTONS', unitKeys: [] } };
  const packed = units.map((unit) => wrapped(unit, settings.wrapCm));
  const pack = makeGroupPacker(cartons, rule, settings);
  const oversize = packed.filter((unit) => !pack([unit]));
  if (oversize.length) return { plans: [], problem: { code: 'OVERSIZE', unitKeys: oversize.map((unit) => unit.key) } };

  const plans = new Map<string, CandidatePlan>();
  const tryGroups = (groups: PackUnit[][]) => {
    const parcels: PlannedParcel[] = [];
    for (const group of groups) {
      const parcel = pack(group);
      if (!parcel) return;
      parcels.push(parcel);
    }
    const plan = { parcels };
    plans.set(planKey(plan), plan);
  };
  const maxParcels = Math.max(1, settings.maxParcelsPerOrder);

  if (packed.length <= EXACT_UNITS) {
    for (const groups of partitions(packed, maxParcels)) tryGroups(groups);
  } else {
    const byVolume = [...packed].sort((a, b) => unitVolume(b) - unitVolume(a) || a.key.localeCompare(b.key));
    // First fit decreasing: each unit joins the parcel it adds the least billable weight to, or opens a new one.
    const greedy: PackUnit[][] = [];
    for (const unit of byVolume) {
      let best: { index: number; added: number } | null = null;
      greedy.forEach((group, index) => {
        const before = pack(group)!.billableWeightGram;
        const after = pack([...group, unit]);
        if (after && (!best || after.billableWeightGram - before < best.added))
          best = { index, added: after.billableWeightGram - before };
      });
      if (best) greedy[(best as { index: number }).index].push(unit);
      else greedy.push([unit]);
    }
    if (greedy.length <= maxParcels) tryGroups(greedy);
    // Balanced splits into k parcels (heaviest unit to the lightest parcel), for every k the order allows.
    const byWeight = [...packed].sort((a, b) => b.weightGram - a.weightGram || a.key.localeCompare(b.key));
    for (let k = 1; k <= maxParcels; k++) {
      const groups: PackUnit[][] = Array.from({ length: k }, () => []);
      const load = new Array<number>(k).fill(0);
      for (const unit of byWeight) {
        const index = load.indexOf(Math.min(...load));
        groups[index].push(unit);
        load[index] += unit.weightGram;
      }
      tryGroups(groups.filter((group) => group.length));
    }
  }
  if (!plans.size) return { plans: [], problem: { code: 'NO_FIT', unitKeys: packed.map((unit) => unit.key) } };
  return { plans: [...plans.values()], problem: null };
}
