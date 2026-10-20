import { carrierLimitProblem, parcelWeights } from '../../src/shared/packing/billable';
import { splitVnd } from '../../src/shared/packing/cod';
import { pricePlan, rankPlans } from '../../src/shared/packing/cost';
import { packCarton } from '../../src/shared/packing/extremePoint';
import { orientations, usableSpace, wrapped, type PackUnit } from '../../src/shared/packing/geometry';
import { candidatePlans, type CandidatePlan } from '../../src/shared/packing/optimizer';
import { parcelCodVnd, toSnapshot } from '../../src/shared/packing/plan';
import { DEFAULT_CARTONS, DEFAULT_PACKING_CONFIG, carrierRule } from '../../src/shared/packing/rules';
import { verifyPlacements } from '../../src/shared/packing/verify';

const settings = DEFAULT_PACKING_CONFIG.settings;
const spx = carrierRule(DEFAULT_PACKING_CONFIG, 10);
const stack = { minSupportRatio: settings.minSupportRatio, maxStackLoadGram: settings.maxStackLoadGram };
// The local fee estimate: 22,000 VND up to 500 g, then 5,000 VND per started 500 g.
const fee = (gram: number) => 22_000 + Math.max(0, Math.ceil((gram - 500) / 500)) * 5_000;

let sequence = 0;
const kit = (grade: keyof typeof DEFAULT_PACKING_CONFIG.grades, overrides: Partial<PackUnit> = {}): PackUnit => {
  const g = DEFAULT_PACKING_CONFIG.grades[grade];
  sequence++;
  return {
    key: `u${sequence}`,
    orderItemId: sequence,
    productId: grade.length * 100 + g.lengthCm,
    name: `${grade} kit`,
    lengthCm: g.lengthCm,
    widthCm: g.widthCm,
    heightCm: g.heightCm,
    weightGram: g.weightGram,
    fragile: true,
    orientation: g.orientation,
    valueVnd: 500_000,
    ...overrides,
  };
};
const best = (units: PackUnit[], cartons = DEFAULT_CARTONS) => {
  const { plans, problem } = candidatePlans(units, cartons, spx, settings);
  const ranked = rankPlans(plans.map((plan) => pricePlan(plan, 10, fee, settings)!).filter(Boolean));
  return { ranked, problem, plans };
};
const checkPlan = (plan: CandidatePlan, units: PackUnit[]) => {
  expect(plan.parcels.flatMap((parcel) => parcel.units.map((unit) => unit.key)).sort()).toEqual(
    units.map((unit) => unit.key).sort(),
  );
  for (const parcel of plan.parcels) {
    expect(
      verifyPlacements(parcel.placements, parcel.units, usableSpace(parcel.carton, settings.paddingCm), stack),
    ).toBeNull();
    expect(carrierLimitProblem(parcel.carton, parcel.actualWeightGram, spx)).toBeNull();
    expect(parcel.billableWeightGram).toBe(
      parcelWeights(
        parcel.carton,
        parcel.units.reduce((sum, unit) => sum + unit.weightGram, 0),
        spx.volumetricDivisor,
      ).billableWeightGram,
    );
  }
};

describe('package optimizer geometry', () => {
  it('lets a kit box only turn flat, and any box take its distinct orientations', () => {
    expect(orientations({ lengthCm: 32, widthCm: 20, heightCm: 8, orientation: 'flat' })).toEqual([
      [32, 20, 8],
      [20, 32, 8],
    ]);
    expect(orientations({ lengthCm: 30, widthCm: 20, heightCm: 10, orientation: 'any' })).toHaveLength(6);
    expect(orientations({ lengthCm: 10, widthCm: 10, heightCm: 10, orientation: 'any' })).toHaveLength(1);
  });

  it('rejects overlapping, floating and crushed placements', () => {
    const [a, b] = [kit('HG', { key: 'a' }), kit('HG', { key: 'b' })];
    const space = [100, 100, 100] as const;
    const at = (key: string, x: number, z: number) => ({ key, x, y: 0, z, lengthCm: 32, widthCm: 20, heightCm: 8 });
    expect(verifyPlacements([at('a', 0, 0), at('b', 10, 0)], [a, b], space, stack)).toMatch(/overlaps/);
    expect(verifyPlacements([at('a', 0, 0), at('b', 0, 20)], [a, b], space, stack)).toMatch(/not supported/);
    expect(verifyPlacements([at('a', 0, 0), at('b', 0, 8)], [a, b], space, stack)).toBeNull();
    const heavy = kit('HG', { key: 'b', weightGram: 5_000 });
    expect(verifyPlacements([at('a', 0, 0), at('b', 0, 8)], [a, heavy], space, stack)).toMatch(/crushed/);
  });

  it('packs into one carton only what physically fits', () => {
    const hg = wrapped(kit('HG'), settings.wrapCm);
    const space = usableSpace(DEFAULT_CARTONS[1], settings.paddingCm);
    expect(packCarton([hg], space, stack)).toHaveLength(1);
    expect(packCarton([hg, wrapped(kit('HG'), settings.wrapCm)], space, stack)).toBeNull();
  });
});

describe('package optimizer plans', () => {
  it('ships one HG kit in the smallest carton that protects it, billed by volumetric weight', () => {
    const { ranked } = best([kit('HG')]);
    const parcel = ranked[0].plan.parcels[0];
    expect(ranked[0].plan.parcels).toHaveLength(1);
    expect(parcel.carton.code).toBe('C-HG');
    // 40 × 28 × 16 cm / 6000 = 2,987 g beats the 400 g kit + 220 g carton.
    expect(parcel.billableWeightGram).toBe(2_987);
  });

  it('keeps two kits in one parcel when that is cheaper than splitting', () => {
    const units = [kit('HG'), kit('HG')];
    const { ranked } = best(units);
    checkPlan(ranked[0].plan, units);
    expect(ranked[0].plan.parcels).toHaveLength(1);
    expect(ranked.some((priced) => priced.plan.parcels.length === 2)).toBe(true);
  });

  it('splits an order over the carrier weight limit into parcels within it', () => {
    const units = Array.from({ length: 8 }, () =>
      kit('OTHER', { lengthCm: 30, widthCm: 20, heightCm: 10, weightGram: 4_000, fragile: false, productId: 999 }),
    );
    const { ranked } = best(units);
    expect(ranked.length).toBeGreaterThan(0);
    checkPlan(ranked[0].plan, units);
    expect(ranked[0].plan.parcels.length).toBeGreaterThanOrEqual(2);
    for (const parcel of ranked[0].plan.parcels) expect(parcel.actualWeightGram).toBeLessThanOrEqual(20_000);
  });

  it('asks staff to decide when a kit fits no carton within the carrier limits', () => {
    const cartons = DEFAULT_CARTONS.filter((carton) => carton.code !== 'C-PG');
    const pg = kit('PG');
    expect(best([kit('HG'), pg], cartons).problem).toEqual({ code: 'OVERSIZE', unitKeys: [pg.key] });
    expect(candidatePlans([], DEFAULT_CARTONS, spx, settings).problem?.code).toBe('NO_UNITS');
    expect(candidatePlans([kit('HG')], [], spx, settings).problem?.code).toBe('NO_CARTONS');
  });

  it('plans larger orders with heuristics, every plan verified', () => {
    const units = [...Array.from({ length: 6 }, () => kit('HG')), ...Array.from({ length: 4 }, () => kit('SD'))];
    const { ranked } = best(units);
    expect(ranked.length).toBeGreaterThan(0);
    for (const priced of ranked) checkPlan(priced.plan, units);
  });

  it('gives the same plan for the same order', () => {
    const order = () => [
      kit('MG', { key: 'm', orderItemId: 1 }),
      kit('HG', { key: 'h', orderItemId: 2 }),
      kit('SD', { key: 's', orderItemId: 3 }),
    ];
    const a = best(order()).ranked[0];
    const b = best(order()).ranked[0];
    expect(toSnapshot(a, false)).toEqual(toSnapshot(b, false));
  });

  it('stays fast at the exact-search and the unit limits', () => {
    const distinct = ['SD', 'HG', 'RG', 'MG', 'EG', 'MGSD', 'HG', 'RG'] as const;
    let started = Date.now();
    best(distinct.map((grade, index) => kit(grade, { productId: 5_000 + index })));
    expect(Date.now() - started).toBeLessThan(2_000);
    started = Date.now();
    const { ranked } = best(Array.from({ length: 30 }, (_, index) => kit(index % 6 ? 'SD' : 'HG')));
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(ranked.length).toBeGreaterThan(0);
  });

  it('only returns physically valid plans within the carrier limits for random orders', () => {
    let seed = 20261020;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
    const grades = ['SD', 'HG', 'RG', 'MG', 'EG', 'MGSD'] as const;
    for (let round = 0; round < 25; round++) {
      const units = Array.from({ length: 1 + Math.floor(random() * 6) }, () =>
        kit(grades[Math.floor(random() * grades.length)]),
      );
      const { plans, problem } = best(units);
      expect(problem).toBeNull();
      for (const plan of plans) checkPlan(plan, units);
    }
  });
});

describe('whole-VND split over parcels', () => {
  it('splits COD by goods value and always adds up', () => {
    expect(splitVnd(1_000_000, [600_000, 400_000])).toEqual([600_000, 400_000]);
    expect(splitVnd(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitVnd(500, [0, 0])).toEqual([500, 0]);
    expect(() => splitVnd(1.5, [1])).toThrow();
    const parts = splitVnd(1_234_567, [123, 456, 789]);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(1_234_567);
  });

  it('gives each parcel of a stored plan its COD share', () => {
    const units = [kit('MG', { valueVnd: 1_500_000 }), kit('HG', { valueVnd: 500_000 })];
    const two = best(units).ranked.find((priced) => priced.plan.parcels.length === 2)!;
    const snapshot = toSnapshot(two, false);
    const cod = parcelCodVnd(snapshot, 1_800_001);
    expect(cod.reduce((sum, part) => sum + part, 0)).toBe(1_800_001);
    expect(snapshot.parcels.map((parcel) => parcel.items.length)).toEqual([1, 1]);
  });
});
