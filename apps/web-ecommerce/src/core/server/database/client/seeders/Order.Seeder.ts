import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import { DAY_MS, daysAfter, historyDays, seedNow, vnDate, vnInstant } from './SeedClock';
import { productTier, tierWeight } from './SeedCatalog';
import OrderModel, { OrderStatus } from '../models/Order.Model';
import OrderItemModel from '../models/OrderItem.Model';
import ProductModel from '../models/Product.Model';
import CouponModel from '../models/Coupon.Model';
import UserModel from '../../internal/models/User.Model';
import events from './data/events_vn.json';

// Demo order history over the last SEED_HISTORY_DAYS days (feeds the dashboard and the agent's growth views):
// a weekly rhythm, bumps during the retail calendar's events (and a lull over the Tết holiday), a slow growth
// trend, coupons, and a traffic mix with UTM tags and ad click ids. Stock/sold figures are not touched.

const BASE_ORDERS_PER_DAY = 4;
const GROWTH_OVER_HISTORY = 0.25; // +25% from the first to the last day
const WEEKDAY_FACTORS = [1.3, 0.8, 0.85, 0.9, 1.0, 1.15, 1.35]; // Sunday .. Saturday
const TET_LULL_DAYS = 7;
const TET_LULL_FACTOR = 0.35;
const COUPON_PROBABILITY = 0.2;
const MIN_DELIVERY_DAYS = 2;
const MAX_DELIVERY_DAYS = 4;
const BATCH = 200;
const CITIES = ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng'];

// Demand multiplier inside each event's window (the calendar in data/events_vn.json).
const EVENT_UPLIFT: Record<string, number> = {
  tet: 2.0,
  valentine: 1.2,
  womens_day_8_3: 1.3,
  reunification: 1.3,
  mid_autumn: 1.2,
  womens_day_20_10: 1.3,
  black_friday: 1.8,
  christmas: 1.4,
};
const DOUBLE_DAY_UPLIFT = 1.6;

interface Traffic {
  weight: number;
  utmSource?: string;
  utmMedium?: string;
  clickIdType?: 'fbclid' | 'gclid' | 'ttclid';
  landingPath: string;
}

// Where the visit that led to the order came from (last non-direct click, as AttributionCapture records it).
const TRAFFIC: Traffic[] = [
  { weight: 52, landingPath: '/' },
  { weight: 18, utmSource: 'facebook', utmMedium: 'social', landingPath: '/shop' },
  { weight: 10, utmSource: 'google', utmMedium: 'cpc', clickIdType: 'gclid', landingPath: '/search' },
  { weight: 9, utmSource: 'facebook', utmMedium: 'paid_social', clickIdType: 'fbclid', landingPath: '/shop' },
  { weight: 5, utmSource: 'tiktok', utmMedium: 'paid_social', clickIdType: 'ttclid', landingPath: '/shop' },
  { weight: 6, utmSource: 'newsletter', utmMedium: 'email', landingPath: '/' },
];

const eventFactor = (date: string): number => {
  let factor = 1;
  for (const event of events) {
    if (date >= event.starts_on && date <= event.ends_on) {
      factor = Math.max(factor, EVENT_UPLIFT[event.code] ?? (event.code.startsWith('double_') ? DOUBLE_DAY_UPLIFT : 1));
    }
    // Shops and buyers are away over the Tết holiday itself (the days after the shopping window).
    if (event.code === 'tet') {
      const lullEnd = vnDate(daysAfter(vnInstant(event.ends_on, 12), TET_LULL_DAYS));
      if (date > event.ends_on && date <= lullEnd) factor = Math.min(factor, TET_LULL_FACTOR);
    }
  }
  return factor;
};

// Recent orders are still in progress, older ones are mostly delivered (with some cancellations).
const statusForAge = (ageDays: number): OrderStatus => {
  if (ageDays < 3) return faker.helpers.arrayElement(['PROCESSING', 'PROCESSING', 'SHIPPED']);
  if (ageDays < 7) return faker.helpers.arrayElement(['PROCESSING', 'SHIPPED', 'SHIPPED', 'DELIVERED']);
  return faker.helpers.weightedArrayElement([
    { weight: 88, value: 'DELIVERED' as OrderStatus },
    { weight: 12, value: 'CANCELLED' as OrderStatus },
  ]);
};

// Delivered a few days after the order was placed, never after the seed's "now".
export const deliveryDate = (createdAt: Date): Date =>
  new Date(
    Math.min(
      seedNow().getTime(),
      createdAt.getTime() + faker.number.int({ min: MIN_DELIVERY_DAYS, max: MAX_DELIVERY_DAYS }) * DAY_MS,
    ),
  );

const weightedProduct = (products: ProductModel[], ageDays: number, createdAt: Date): ProductModel | undefined => {
  const candidates = products
    .filter((product) => product.createdAt <= createdAt)
    .map((product) => ({ weight: tierWeight(productTier(product.sku), ageDays), value: product }))
    .filter((candidate) => candidate.weight > 0);
  return candidates.length > 0 ? faker.helpers.weightedArrayElement(candidates) : undefined;
};

const usableCoupon = (coupons: CouponModel[], uses: Map<string, number>, createdAt: Date, subtotal: number) => {
  const usable = coupons.filter(
    (coupon) =>
      coupon.isActive &&
      coupon.startDate <= createdAt &&
      createdAt <= coupon.expirationDate &&
      subtotal >= coupon.minOrderVnd &&
      (coupon.usageLimit == null || coupon.usageCount + (uses.get(coupon.code) || 0) < coupon.usageLimit),
  );
  return usable.length > 0 ? faker.helpers.arrayElement(usable) : undefined;
};

export const seedOrderData = async (): Promise<void> => {
  try {
    const customers = await UserModel.findAll({ where: { role: 'USER' }, order: [['id', 'ASC']] });
    // Repeated synthetic sales may use interchangeable new kits, never a unique used model.
    const products = await ProductModel.findAll({ where: { isArchived: false, condition: 'new' }, order: [['id', 'ASC']] });
    const coupons = await CouponModel.findAll({ order: [['id', 'ASC']] });
    if (customers.length === 0 || products.length === 0) {
      Logger.WARN('No customers or products found: orders were not seeded.');
      return;
    }

    const now = seedNow();
    const days = historyDays();
    const couponUses = new Map<string, number>();
    const pending: { order: Record<string, unknown>; lines: Record<string, unknown>[] }[] = [];

    for (let ageDay = days - 1; ageDay >= 0; ageDay--) {
      const date = vnDate(new Date(now.getTime() - ageDay * DAY_MS));
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const trend = 1 + GROWTH_OVER_HISTORY * ((days - 1 - ageDay) / Math.max(days - 1, 1));
      const expected = BASE_ORDERS_PER_DAY * WEEKDAY_FACTORS[weekday] * eventFactor(date) * trend;
      const count = Math.floor(expected + faker.number.float({ min: 0, max: 1 }));

      for (let index = 0; index < count; index++) {
        const createdAt = vnInstant(date, faker.number.int({ min: 8, max: 22 }), faker.number.int({ min: 0, max: 59 }));
        if (createdAt > now) continue;
        const ageDays = (now.getTime() - createdAt.getTime()) / DAY_MS;
        const picked = new Map<number, ProductModel>();
        const lineCount = faker.helpers.weightedArrayElement([
          { weight: 65, value: 1 },
          { weight: 25, value: 2 },
          { weight: 10, value: 3 },
        ]);
        for (let line = 0; line < lineCount; line++) {
          const product = weightedProduct(products, ageDays, createdAt);
          if (product) picked.set(product.id, product);
        }
        if (picked.size === 0) continue;

        const status = statusForAge(ageDays);
        const lines = [...picked.values()].map((product) => ({
          productId: product.id,
          productName: product.name,
          imageUrl: product.imageUrl,
          size: product.availableSizes.length > 0 ? faker.helpers.arrayElement(product.availableSizes) : '',
          quantity: faker.helpers.weightedArrayElement([
            { weight: 85, value: 1 },
            { weight: 15, value: 2 },
          ]),
          unitPrice: product.price,
          createdAt,
          updatedAt: createdAt,
        }));
        const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
        const coupon =
          status !== 'CANCELLED' && faker.datatype.boolean({ probability: COUPON_PROBABILITY })
            ? usableCoupon(coupons, couponUses, createdAt, subtotal)
            : undefined;
        const discount = coupon ? Math.round((subtotal * coupon.discountPercent) / 100) : 0;
        if (coupon) couponUses.set(coupon.code, (couponUses.get(coupon.code) || 0) + 1);
        const traffic: Traffic = faker.helpers.weightedArrayElement(
          TRAFFIC.map((item) => ({ weight: item.weight, value: item })),
        );
        const customer = faker.helpers.arrayElement(customers);

        pending.push({
          order: {
            userId: customer.id,
            status,
            paymentMethod: 'COD',
            paymentStatus: status === 'DELIVERED' ? 'PAID' : 'PENDING',
            subtotal,
            discount,
            shippingFee: 0,
            tax: 0,
            total: subtotal - discount,
            couponCode: coupon ? coupon.code : null,
            recipientName: `${customer.lastName} ${customer.firstName}`,
            phone: customer.phone || `09${faker.string.numeric(8)}`,
            address: customer.address || faker.location.streetAddress(),
            ward: `Phường ${faker.number.int({ min: 1, max: 15 })}`,
            district: `Quận ${faker.number.int({ min: 1, max: 12 })}`,
            city: faker.helpers.arrayElement(CITIES),
            deliveredAt: status === 'DELIVERED' ? deliveryDate(createdAt) : null,
            utmSource: traffic.utmSource ?? null,
            utmMedium: traffic.utmMedium ?? null,
            utmCampaign: traffic.utmSource ? `${traffic.utmSource}-${date.slice(0, 7)}` : null,
            clickId: traffic.clickIdType ? `${traffic.clickIdType}-${faker.string.alphanumeric(16)}` : null,
            clickIdType: traffic.clickIdType ?? null,
            landingPath: traffic.landingPath,
            createdAt,
            updatedAt: createdAt,
          },
          lines,
        });
      }
    }

    for (let start = 0; start < pending.length; start += BATCH) {
      const batch = pending.slice(start, start + BATCH);
      // bulkCreate keeps the back-dated createdAt/updatedAt given in the rows
      const orders = await OrderModel.bulkCreate(
        batch.map((item) => item.order),
        { returning: true },
      );
      await OrderItemModel.bulkCreate(
        batch.flatMap((item, index) => item.lines.map((line) => ({ ...line, orderId: orders[index].id }))),
      );
    }
    for (const [code, uses] of couponUses) {
      await CouponModel.increment('usageCount', { by: uses, where: { code } });
    }
    Logger.INFO(`${pending.length} orders seeded over ${days} days.`);
  } catch (error) {
    Logger.ERROR('Error seeding the order table:', error);
    failIfStrict(error);
  }
};
