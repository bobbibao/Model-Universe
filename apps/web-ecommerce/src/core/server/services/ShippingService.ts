import ConfigModel from '../database/internal/models/Config.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, isValidPhone } from '../../../shared/server/utils/ValidationUtils';
import {
  estimateShippingFeeVnd,
  packageForUnits,
  type DeliveryAddress,
  type PackageSpec,
} from '../../../shared/fulfillment';
import * as Ghn from './delivery/GhnClient';
import { openMapStyleUrl } from './delivery/OpenMapClient';
import { paymentsEnabled } from './PaymentConfig';

export const REQUIRED_NOTES = ['CHOXEMHANGKHONGTHU', 'KHONGCHOXEMHANG', 'CHOTHUHANG'] as const;
export type RequiredNote = (typeof REQUIRED_NOTES)[number];

// The shop's pickup (sender) and return address and delivery defaults, edited by staff (Admin → Shipping).
export interface ShippingOrigin {
  name: string;
  phone: string;
  address: DeliveryAddress;
  requiredNote: RequiredNote;
  defaultPackage: Pick<PackageSpec, 'weightGram' | 'lengthCm' | 'widthCm' | 'heightCm'>;
  // Create the GHN order automatically once the deposit or full payment is verified.
  autoCreate: boolean;
}

const ORIGIN_KEY = 'shipping.origin';

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

export default class ShippingService {
  // A two-level address checked against GHN's master data when GHN is configured.
  async validateAddress(raw: unknown): Promise<DeliveryAddress> {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const provinceId = Number(value.provinceId),
      wardId = Number(value.wardId);
    const street = asTrimmedString(value.street);
    if (!Number.isSafeInteger(provinceId) || provinceId < 1 || !Number.isSafeInteger(wardId) || wardId < 1)
      throw HttpError.badRequest('Choose the province/city and the ward/commune.', undefined, 'ADDRESS_INCOMPLETE');
    if (street.length < 4 || street.length > 255)
      throw HttpError.badRequest(
        'Enter the house number and street (4–255 characters).',
        undefined,
        'ADDRESS_INCOMPLETE',
      );
    let provinceName = asTrimmedString(value.provinceName),
      wardName = asTrimmedString(value.wardName);
    if (Ghn.ghnConfigured()) {
      const province = (await Ghn.provinces()).find((row) => row.id === provinceId);
      const ward = province ? (await Ghn.wards(provinceId)).find((row) => row.id === wardId) : undefined;
      if (!province || !ward)
        throw HttpError.badRequest(
          'The ward does not belong to the chosen province. Choose it again.',
          undefined,
          'ADDRESS_INVALID',
        );
      provinceName = province.name;
      wardName = ward.name;
    } else if (!provinceName || !wardName)
      throw HttpError.badRequest('Choose the province/city and the ward/commune.', undefined, 'ADDRESS_INCOMPLETE');
    return {
      provinceId,
      provinceName,
      wardId,
      wardName,
      street,
      latitude: coordinate(value.latitude, 8, 24),
      longitude: coordinate(value.longitude, 102, 110),
    };
  }

  async origin(): Promise<ShippingOrigin | null> {
    const row = await ConfigModel.findOne({ where: { configKey: ORIGIN_KEY }, order: [['id', 'DESC']] });
    if (!row) return null;
    try {
      return JSON.parse(row.configValue) as ShippingOrigin;
    } catch {
      return null;
    }
  }

  async saveOrigin(actorUserId: number, data: Record<string, unknown>) {
    const actor = await UserModel.findByPk(actorUserId);
    if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
    const name = asTrimmedString(data.name),
      phone = asTrimmedString(data.phone);
    if (!name || name.length > 120) throw HttpError.badRequest('Enter the sender name.');
    if (!isValidPhone(phone)) throw HttpError.badRequest('Enter a valid sender phone number.');
    const requiredNote = (REQUIRED_NOTES as readonly string[]).includes(String(data.requiredNote))
      ? (data.requiredNote as RequiredNote)
      : 'CHOXEMHANGKHONGTHU';
    const parcel = (
      data.defaultPackage && typeof data.defaultPackage === 'object' ? data.defaultPackage : {}
    ) as Record<string, unknown>;
    const origin: ShippingOrigin = {
      name,
      phone,
      address: await this.validateAddress(data.address),
      requiredNote,
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

  originParty(origin: ShippingOrigin | null): Ghn.GhnParty | null {
    if (!origin) return null;
    return {
      name: origin.name,
      phone: origin.phone,
      address: `${origin.address.street}, ${origin.address.wardName}, ${origin.address.provinceName}`,
      wardName: origin.address.wardName,
      provinceName: origin.address.provinceName,
    };
  }

  // The GHN fee and delivery estimate for a recipient address (checkout and order placement). Uses GHN's preview
  // (same contract and pricing as order creation, nothing is created); without GHN credentials a local estimate.
  async quote(input: {
    units: number;
    address: DeliveryAddress;
    recipientName: string;
    phone: string;
    codAmountVnd: number;
    orderValueVnd: number;
  }) {
    const parcel = await this.packageFor(input.units);
    if (!Ghn.ghnConfigured())
      return {
        feeVnd: estimateShippingFeeVnd(parcel),
        expectedDeliveryTime: null,
        source: 'estimate' as const,
        package: parcel,
      };
    const origin = await this.origin();
    // GHN prices from the pickup address; a new GHN shop has none on its profile until staff set it here.
    if (!origin)
      throw HttpError.serviceUnavailable(
        'GHN delivery is not set up yet: staff must enter the pickup address in Admin → GHN delivery.',
        'SHIPPING_ORIGIN_MISSING',
      );
    const result = await Ghn.previewOrder({
      clientOrderCode: '',
      to: {
        name: input.recipientName || 'Khách hàng',
        phone: isValidPhone(input.phone) ? input.phone : origin?.phone || '0900000000',
        address: `${input.address.street}, ${input.address.wardName}, ${input.address.provinceName}`,
        wardName: input.address.wardName,
        provinceName: input.address.provinceName,
      },
      from: this.originParty(origin),
      weightGram: parcel.weightGram,
      lengthCm: parcel.lengthCm,
      widthCm: parcel.widthCm,
      heightCm: parcel.heightCm,
      codAmountVnd: Math.min(Ghn.ghnCodLimitVnd(), input.codAmountVnd),
      insuranceValueVnd: input.orderValueVnd,
      orderValueVnd: input.orderValueVnd,
      requiredNote: origin?.requiredNote || 'CHOXEMHANGKHONGTHU',
      items: [{ name: 'Mô hình', quantity: Math.max(1, input.units), price: 0 }],
    });
    return {
      feeVnd: result.totalFeeVnd,
      expectedDeliveryTime: result.expectedDeliveryTime,
      source: 'ghn' as const,
      package: parcel,
    };
  }

  config() {
    return {
      ghnConfigured: Ghn.ghnConfigured(),
      ghnOrderMode: Ghn.ghnOrderMode(),
      // The most GHN will collect on delivery for this shop: checkout raises the upfront payment above it.
      codLimitVnd: Ghn.ghnCodLimitVnd(),
      // The Openmap.vn map style (its key is domain-restricted), or null for the OpenStreetMap raster fallback.
      mapStyleUrl: openMapStyleUrl(),
      onlinePayment: paymentsEnabled(),
    };
  }
}
