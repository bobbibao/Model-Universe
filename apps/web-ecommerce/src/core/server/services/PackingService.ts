import ConfigModel from '../database/internal/models/Config.Model';
import UserModel from '../database/internal/models/User.Model';
import ShippingCartonModel from '../database/client/models/ShippingCarton.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';
import { GRADES } from '../../../shared/gunpla';
import type { Carton } from '../../../shared/packing/geometry';
import {
  DEFAULT_PACKING_CONFIG,
  type CarrierParcelRule,
  type GradePackDefault,
  type PackingConfig,
} from '../../../shared/packing/rules';

const PACKING_KEY = 'shipping.packing';

const whole = (value: unknown, field: string, min: number, max: number) => {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max)
    throw HttpError.badRequest(`Provide ${field} (${min}–${max}).`, undefined, 'PACKING_INVALID');
  return number;
};
const object = (value: unknown) =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;

const parseBox = (raw: unknown, label: string): GradePackDefault => {
  const value = object(raw);
  return {
    lengthCm: whole(value.lengthCm, `${label} length (cm)`, 1, 200),
    widthCm: whole(value.widthCm, `${label} width (cm)`, 1, 200),
    heightCm: whole(value.heightCm, `${label} height (cm)`, 1, 200),
    weightGram: whole(value.weightGram, `${label} weight (g)`, 1, 50_000),
    orientation: value.orientation === 'any' ? 'any' : 'flat',
  };
};
const parseRule = (raw: unknown, label: string): CarrierParcelRule => {
  const value = object(raw);
  return {
    maxWeightGram: whole(value.maxWeightGram, `${label} maximum weight (g)`, 500, 100_000),
    maxSideCm: whole(value.maxSideCm, `${label} longest side (cm)`, 10, 300),
    maxSumCm: whole(value.maxSumCm, `${label} length + width + height (cm)`, 20, 600),
    volumetricDivisor: whole(value.volumetricDivisor, `${label} volumetric divisor`, 1000, 10_000),
    verified: value.verified === true,
  };
};

// The package optimizer's settings (carrier limits, cushioning, typical kit boxes) and the shop's carton catalog,
// edited by staff in Admin → Delivery. Planning itself lives in PackagePlanService.
export default class PackingService {
  async config(): Promise<PackingConfig> {
    const row = await ConfigModel.findOne({ where: { configKey: PACKING_KEY }, order: [['id', 'DESC']] });
    if (!row) return DEFAULT_PACKING_CONFIG;
    try {
      const saved = JSON.parse(row.configValue) as Partial<PackingConfig>;
      // Values added after the row was saved come from the defaults.
      return {
        settings: { ...DEFAULT_PACKING_CONFIG.settings, ...saved.settings },
        carriers: { ...DEFAULT_PACKING_CONFIG.carriers, ...saved.carriers },
        grades: { ...DEFAULT_PACKING_CONFIG.grades, ...saved.grades },
        fallback: saved.fallback ?? DEFAULT_PACKING_CONFIG.fallback,
      };
    } catch {
      return DEFAULT_PACKING_CONFIG;
    }
  }

  private async admin(actorUserId: number) {
    const actor = await UserModel.findByPk(actorUserId);
    if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
  }

  async saveConfig(actorUserId: number, data: Record<string, unknown>) {
    await this.admin(actorUserId);
    const settings = object(data.settings);
    const carriers: Record<string, CarrierParcelRule> = {};
    for (const rule of Array.isArray(data.carriers) ? data.carriers : []) {
      const key = String(object(rule).key ?? '');
      if (key !== 'default' && !/^\d{1,4}$/.test(key))
        throw HttpError.badRequest('Unknown carrier.', undefined, 'PACKING_INVALID');
      carriers[key] = parseRule(rule, key === 'default' ? 'Default carrier' : `Carrier ${key}`);
    }
    if (!carriers.default) throw HttpError.badRequest('Keep the default carrier limits.', undefined, 'PACKING_INVALID');
    const grades: Record<string, GradePackDefault> = {};
    for (const box of Array.isArray(data.grades) ? data.grades : []) {
      const grade = String(object(box).grade ?? '');
      if (!(GRADES as readonly string[]).includes(grade))
        throw HttpError.badRequest('Unknown grade.', undefined, 'PACKING_INVALID');
      grades[grade] = parseBox(box, grade);
    }
    const config: PackingConfig = {
      settings: {
        paddingCm: whole(settings.paddingCm, 'the carton cushioning (cm)', 0, 10),
        wrapCm: whole(settings.wrapCm, 'the bubble wrap (cm)', 0, 5),
        minSupportRatio: DEFAULT_PACKING_CONFIG.settings.minSupportRatio,
        maxStackLoadGram: whole(settings.maxStackLoadGram, 'the weight a kit box may carry (g)', 0, 50_000),
        handlingVndPerParcel: whole(settings.handlingVndPerParcel, 'the handling cost per parcel (VND)', 0, 1_000_000),
        splitPenaltyVnd: whole(settings.splitPenaltyVnd, 'the cost of an extra parcel (VND)', 0, 1_000_000),
        maxParcelsPerOrder: whole(settings.maxParcelsPerOrder, 'the most parcels per order', 1, 10),
        maxUnits: DEFAULT_PACKING_CONFIG.settings.maxUnits,
      },
      carriers,
      grades: { ...DEFAULT_PACKING_CONFIG.grades, ...grades },
      fallback: parseBox(data.fallback, 'The fallback box'),
    };
    const [row, created] = await ConfigModel.findOrCreate({
      where: { configKey: PACKING_KEY },
      defaults: { configKey: PACKING_KEY, configValue: JSON.stringify(config) },
    });
    if (!created) await row.update({ configValue: JSON.stringify(config) });
    return this.configView(config);
  }

  // The settings as the admin page edits them: carriers and grades as lists (their keys, such as "RE/100" or "10",
  // must survive the client's camel-casing of object keys).
  configView(config: PackingConfig) {
    return {
      settings: config.settings,
      carriers: Object.entries(config.carriers).map(([key, rule]) => ({ key, ...rule })),
      grades: Object.entries(config.grades).map(([grade, box]) => ({ grade, ...box })),
      fallback: config.fallback,
    };
  }

  async cartons(activeOnly = false): Promise<Carton[]> {
    const rows = await ShippingCartonModel.findAll({
      where: activeOnly ? { active: true } : {},
      order: [
        ['innerLengthCm', 'ASC'],
        ['code', 'ASC'],
      ],
    });
    return rows.map((row) => ({ ...(row.get({ plain: true }) as Carton & { id: number; active: boolean }) }));
  }

  // Adds a carton or updates one (cartons are never deleted: past plans name them; staff deactivate them instead).
  async saveCarton(actorUserId: number, data: Record<string, unknown>) {
    await this.admin(actorUserId);
    const code = asTrimmedString(data.code).toUpperCase();
    if (!/^[A-Z0-9-]{2,32}$/.test(code))
      throw HttpError.badRequest('Carton codes use 2–32 letters, digits or dashes.', undefined, 'PACKING_INVALID');
    const name = asTrimmedString(data.name);
    if (!name || name.length > 80) throw HttpError.badRequest('Name the carton.', undefined, 'PACKING_INVALID');
    const values = {
      code,
      name,
      innerLengthCm: whole(data.innerLengthCm, 'the inner length (cm)', 1, 200),
      innerWidthCm: whole(data.innerWidthCm, 'the inner width (cm)', 1, 200),
      innerHeightCm: whole(data.innerHeightCm, 'the inner height (cm)', 1, 200),
      outerLengthCm: whole(data.outerLengthCm, 'the outer length (cm)', 1, 210),
      outerWidthCm: whole(data.outerWidthCm, 'the outer width (cm)', 1, 210),
      outerHeightCm: whole(data.outerHeightCm, 'the outer height (cm)', 1, 210),
      tareWeightGram: whole(data.tareWeightGram, 'the empty carton weight (g)', 0, 10_000),
      costVnd: whole(data.costVnd, 'the carton price (VND)', 0, 1_000_000),
      maxLoadGram: whole(data.maxLoadGram, 'the carton load (g)', 100, 100_000),
      active: data.active !== false,
    };
    if (
      values.outerLengthCm < values.innerLengthCm ||
      values.outerWidthCm < values.innerWidthCm ||
      values.outerHeightCm < values.innerHeightCm
    )
      throw HttpError.badRequest('Outer sizes cannot be smaller than inner sizes.', undefined, 'PACKING_INVALID');
    const existing = await ShippingCartonModel.findOne({ where: { code } });
    if (existing) await existing.update(values);
    else await ShippingCartonModel.create(values);
    return this.cartons();
  }
}
