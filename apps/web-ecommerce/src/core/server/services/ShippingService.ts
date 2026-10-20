import ConfigModel from '../database/internal/models/Config.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';
import {
  billableWeightGram,
  cheapestCarrier,
  estimateShippingFeeVnd,
  packageForUnits,
  type DeliveryAddress,
  type PackageSpec,
  type ShippingQuoteSnapshot,
} from '../../../shared/fulfillment';
import * as SuperAi from './delivery/SuperAiClient';
import { openMapStyleUrl } from './delivery/OpenMapClient';
import { paymentLinkMinutes, paymentsEnabled } from './PaymentConfig';
import PackagePlanService, { type PlanItem } from './PackagePlanService';

// Whether the receiver may look at (1), try (2) or not open (3) the parcel before paying (SuperAI `config`).
export const VIEW_CONFIGS = ['1', '2', '3'] as const;
export type ViewConfig = (typeof VIEW_CONFIGS)[number];

// The shop's pickup point (a SuperAI warehouse, managed in the SuperAI portal) and delivery defaults, edited by staff
// (Admin → Delivery).
export interface ShippingOrigin {
  warehouseCode: string;
  warehouseName: string;
  phone: string | null;
  address: string;
  communeName: string;
  districtName: string;
  provinceName: string;
  viewConfig: ViewConfig;
  defaultPackage: Pick<PackageSpec, 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm'>;
  // Create the SuperAI order automatically once the deposit or full payment is verified.
  autoCreate: boolean;
}

export type ShippingQuote = ShippingQuoteSnapshot;

const ORIGIN_KEY = 'shipping.origin';
const SHOWROOM_KEY = 'shipping.showroom';

// Where customers come to see and collect their order in person ("Gặp trực tiếp"): the shop's address as shown at
// checkout and on the order, with opening hours and directions. Defaults to the SuperAI pickup warehouse.
export interface Showroom {
  name: string;
  address: string;
  city: string;
  phone: string | null;
  openingHours: string | null;
  directions: string | null;
  latitude: number | null;
  longitude: number | null;
  // How long the shop needs to prepare a visit: the earliest slot starts this many hours after the order.
  leadHours: number;
}

const whole = (value: unknown, field: string, min: number, max: number) => {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max)
    throw HttpError.badRequest(`Provide ${field} (${min}–${max}).`);
  return number;
};
const coordinate = (value: unknown, min: number, max: number) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};
const code = (value: unknown) => asTrimmedString(value).slice(0, 16);

export default class ShippingService {
  // A province → district → commune address checked against SuperAI's area master data when SuperAI is configured
  // (names always come from the master data then, never from the client).
  async validateAddress(raw: unknown): Promise<DeliveryAddress> {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const provinceCode = code(value.provinceCode),
      districtCode = code(value.districtCode),
      communeCode = code(value.communeCode);
    const street = asTrimmedString(value.street);
    if (!provinceCode || !districtCode || !communeCode)
      throw HttpError.badRequest(
        'Choose the province/city, the district and the ward/commune.',
        undefined,
        'ADDRESS_INCOMPLETE',
      );
    if (street.length < 4 || street.length > 255)
      throw HttpError.badRequest(
        'Enter the house number and street (4–255 characters).',
        undefined,
        'ADDRESS_INCOMPLETE',
      );
    let provinceName = asTrimmedString(value.provinceName),
      districtName = asTrimmedString(value.districtName),
      communeName = asTrimmedString(value.communeName);
    if (SuperAi.superAiConfigured()) {
      const province = (await SuperAi.provinces()).find((row) => row.code === provinceCode);
      const district = province
        ? (await SuperAi.districts(provinceCode)).find((row) => row.code === districtCode)
        : undefined;
      const commune = district
        ? (await SuperAi.communes(districtCode)).find((row) => row.code === communeCode)
        : undefined;
      if (!province || !district || !commune)
        throw HttpError.badRequest(
          'The ward/commune does not belong to the chosen district and province. Choose it again.',
          undefined,
          'ADDRESS_INVALID',
        );
      provinceName = province.name;
      districtName = district.name;
      communeName = commune.name;
    } else if (!provinceName || !districtName || !communeName)
      throw HttpError.badRequest(
        'Choose the province/city, the district and the ward/commune.',
        undefined,
        'ADDRESS_INCOMPLETE',
      );
    return {
      provinceCode,
      provinceName,
      districtCode,
      districtName,
      communeCode,
      communeName,
      street,
      latitude: coordinate(value.latitude, 8, 24),
      longitude: coordinate(value.longitude, 102, 110),
    };
  }

  async origin(): Promise<ShippingOrigin | null> {
    const row = await ConfigModel.findOne({ where: { configKey: ORIGIN_KEY }, order: [['id', 'DESC']] });
    if (!row) return null;
    try {
      const value = JSON.parse(row.configValue) as Partial<ShippingOrigin>;
      // An origin saved for the earlier carrier (no SuperAI warehouse) must be chosen again.
      return value.warehouseCode ? (value as ShippingOrigin) : null;
    } catch {
      return null;
    }
  }

  async showroom(): Promise<Showroom | null> {
    const row = await ConfigModel.findOne({ where: { configKey: SHOWROOM_KEY }, order: [['id', 'DESC']] });
    if (row)
      try {
        return { leadHours: 24, ...(JSON.parse(row.configValue) as Partial<Showroom>) } as Showroom;
      } catch {
        /* fall back to the warehouse */
      }
    const origin = await this.origin();
    return origin
      ? {
          name: 'MODEL universe',
          address: origin.address,
          city: origin.provinceName,
          phone: origin.phone,
          openingHours: null,
          directions: null,
          latitude: null,
          longitude: null,
          leadHours: 24,
        }
      : null;
  }

  async saveShowroom(actorUserId: number, data: Record<string, unknown>) {
    const actor = await UserModel.findByPk(actorUserId);
    if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
    const text = (value: unknown, max: number) => asTrimmedString(value).slice(0, max);
    const showroom: Showroom = {
      name: text(data.name, 120),
      address: text(data.address, 255),
      city: text(data.city, 120),
      phone: text(data.phone, 20) || null,
      openingHours: text(data.openingHours, 200) || null,
      directions: text(data.directions, 500) || null,
      latitude: coordinate(data.latitude, 8, 24),
      longitude: coordinate(data.longitude, 102, 110),
      leadHours: whole(data.leadHours ?? 24, 'the preparation time (hours)', 1, 168),
    };
    if (!showroom.name || showroom.address.length < 4 || !showroom.city)
      throw HttpError.badRequest('Enter the shop name, address and province where customers meet you.');
    const [row, created] = await ConfigModel.findOrCreate({
      where: { configKey: SHOWROOM_KEY },
      defaults: { configKey: SHOWROOM_KEY, configValue: JSON.stringify(showroom) },
    });
    if (!created) await row.update({ configValue: JSON.stringify(showroom) });
    return showroom;
  }

  async saveOrigin(actorUserId: number, data: Record<string, unknown>) {
    const actor = await UserModel.findByPk(actorUserId);
    if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
    const warehouseCode = asTrimmedString(data.warehouseCode);
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(warehouseCode))
      throw HttpError.badRequest('Choose the SuperAI pickup warehouse.');
    let warehouse: Omit<ShippingOrigin, 'viewConfig' | 'defaultPackage' | 'autoCreate'>;
    if (SuperAi.superAiConfigured()) {
      const found = (await SuperAi.warehouses()).find((row) => row.code === warehouseCode);
      if (!found?.active)
        throw HttpError.badRequest(
          'This warehouse is not an active SuperAI warehouse of the shop.',
          undefined,
          'WAREHOUSE_INVALID',
        );
      warehouse = {
        warehouseCode,
        warehouseName: found.name,
        phone: found.phone,
        address: found.formattedAddress,
        communeName: found.communeName,
        districtName: found.districtName,
        provinceName: found.provinceName,
      };
    } else {
      // Without SuperAI (development, tests) the warehouse's area names are entered by hand.
      const provinceName = asTrimmedString(data.provinceName),
        districtName = asTrimmedString(data.districtName);
      if (!provinceName || !districtName) throw HttpError.badRequest('Enter the warehouse province and district.');
      warehouse = {
        warehouseCode,
        warehouseName: asTrimmedString(data.warehouseName) || warehouseCode,
        phone: asTrimmedString(data.phone) || null,
        address: asTrimmedString(data.address),
        communeName: asTrimmedString(data.communeName),
        districtName,
        provinceName,
      };
    }
    const parcel = (
      data.defaultPackage && typeof data.defaultPackage === 'object' ? data.defaultPackage : {}
    ) as Record<string, unknown>;
    const origin: ShippingOrigin = {
      ...warehouse,
      viewConfig: (VIEW_CONFIGS as readonly string[]).includes(String(data.viewConfig))
        ? (String(data.viewConfig) as ViewConfig)
        : '1',
      defaultPackage: {
        weightGram: whole(parcel.weightGram, 'the default weight per kit (g)', 1, 50_000),
        lengthCm: whole(parcel.lengthCm, 'the default length (cm)', 1, 200),
        widthCm: whole(parcel.widthCm, 'the default width (cm)', 1, 200),
        heightCm: whole(parcel.heightCm, 'the default height (cm)', 1, 200),
      },
      autoCreate: data.autoCreate !== false,
    };
    const [row, created] = await ConfigModel.findOrCreate({
      where: { configKey: ORIGIN_KEY },
      defaults: { configKey: ORIGIN_KEY, configValue: JSON.stringify(origin) },
    });
    if (!created) await row.update({ configValue: JSON.stringify(origin) });
    return origin;
  }

  // The package quoted for `units` kits, from the shop's default kit box.
  async packageFor(units: number): Promise<PackageSpec> {
    const origin = await this.origin();
    const base = packageForUnits(units);
    if (!origin) return base;
    const count = Math.min(Math.max(units, 1), 20);
    const box = origin.defaultPackage;
    return {
      ...base,
      weightGram: box.weightGram * count,
      lengthCm: box.lengthCm,
      widthCm: box.widthCm,
      heightCm: Math.min(200, box.heightCm * count),
    };
  }

  // Every carrier's price for a parcel to this address, and the cheapest one checkout charges. Carriers bill the larger
  // of the real and the volumetric weight, so that is the weight quoted. Without SuperAI a local estimate.
  async quoteParcel(input: {
    parcel: PackageSpec;
    address: DeliveryAddress;
    goodsValueVnd: number;
  }): Promise<ShippingQuote> {
    const weightGram = billableWeightGram(input.parcel);
    if (!SuperAi.superAiConfigured())
      return {
        feeVnd: estimateShippingFeeVnd(input.parcel),
        carrier: null,
        options: [],
        weightGram,
        source: 'estimate',
      };
    const origin = await this.origin();
    if (!origin)
      throw HttpError.serviceUnavailable(
        'Delivery is not set up yet: staff must choose the SuperAI pickup warehouse in Admin → Delivery.',
        'SHIPPING_ORIGIN_MISSING',
      );
    const options = await SuperAi.price({
      senderProvince: origin.provinceName,
      senderDistrict: origin.districtName,
      receiverProvince: input.address.provinceName,
      receiverDistrict: input.address.districtName,
      weightGram,
      valueVnd: input.goodsValueVnd,
    });
    const carrier = cheapestCarrier(options);
    if (!carrier)
      throw HttpError.conflict('No carrier delivers to this address right now. Check the address.', 'NO_CARRIER');
    return {
      feeVnd: carrier.feeVnd,
      carrier,
      options: [...options].sort((a, b) => a.feeVnd - b.feeVnd),
      weightGram,
      source: 'superai',
    };
  }

  // The delivery fee at checkout and order placement: the package optimizer's cheapest plan (one or more parcels)
  // and carrier for these lines and address. The quote carries the plan.
  async quote(input: { items: PlanItem[]; address: DeliveryAddress }): Promise<ShippingQuote> {
    const origin = await this.origin();
    return (await new PackagePlanService().quote(input.items, { origin, address: input.address })).quote;
  }

  config() {
    return {
      superAiConfigured: SuperAi.superAiConfigured(),
      orderMode: SuperAi.superAiOrderMode(),
      // The most the carrier will collect on delivery: checkout raises the upfront payment above it.
      codLimitVnd: SuperAi.shippingCodLimitVnd(),
      // The Openmap.vn map style (its key is domain-restricted), or null for the OpenStreetMap raster fallback.
      mapStyleUrl: openMapStyleUrl(),
      onlinePayment: paymentsEnabled(),
      paymentMinutes: paymentLinkMinutes(),
    };
  }
}
