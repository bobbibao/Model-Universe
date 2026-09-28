import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import OrderModel, { OrderStatus } from '../models/Order.Model';
import OrderItemModel from '../models/OrderItem.Model';
import ProductModel from '../models/Product.Model';
import CouponModel from '../models/Coupon.Model';
import UserModel from '../../internal/models/User.Model';

const ORDER_COUNT = 90;
const HISTORY_DAYS = 240;
const RECENT_ORDER_COUNT = 8;
const RECENT_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const COUPON_CODE = 'WELCOME10';
const COUPON_PERCENT = 10;
const CITIES = ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng'];

// Recent orders are still in progress, older ones are mostly delivered (with some cancellations).
const statusForAge = (ageDays: number): OrderStatus => {
  if (ageDays < 3) return faker.helpers.arrayElement(['PROCESSING', 'PROCESSING', 'SHIPPED']);
  if (ageDays < 7) return faker.helpers.arrayElement(['PROCESSING', 'SHIPPED', 'SHIPPED', 'DELIVERED']);
  return faker.helpers.weightedArrayElement([
    { weight: 85, value: 'DELIVERED' as OrderStatus },
    { weight: 15, value: 'CANCELLED' as OrderStatus },
  ]);
};

// Demo order history spread over the last months (feeds the admin dashboard). Stock/sold figures are not touched.
export const seedOrderData = async (): Promise<void> => {
  try {
    const customers = await UserModel.findAll({ where: { role: 'USER' } });
    const products = await ProductModel.findAll({ where: { isArchived: false } });
    if (customers.length === 0 || products.length === 0) {
      Logger.WARN('No customers or products found: orders were not seeded.');
      return;
    }

    let couponUses = 0;
    for (let index = 0; index < ORDER_COUNT; index++) {
      const customer = faker.helpers.arrayElement(customers);
      // The first few orders are recent so that the admin always has orders to process.
      const maxAgeDays = index < RECENT_ORDER_COUNT ? RECENT_DAYS : HISTORY_DAYS;
      const createdAt = new Date(Date.now() - faker.number.int({ min: 0, max: maxAgeDays * DAY_MS }));
      const ageDays = (Date.now() - createdAt.getTime()) / DAY_MS;
      const status = statusForAge(ageDays);
      const lines = faker.helpers.arrayElements(products, { min: 1, max: 3 }).map((product) => ({
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        size: product.availableSizes.length > 0 ? faker.helpers.arrayElement(product.availableSizes) : '',
        quantity: faker.number.int({ min: 1, max: 2 }),
        unitPrice: product.price,
        createdAt,
        updatedAt: createdAt,
      }));
      const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
      const usesCoupon = status !== 'CANCELLED' && faker.datatype.boolean({ probability: 0.25 });
      const discount = usesCoupon ? Math.round((subtotal * COUPON_PERCENT) / 100) : 0;
      if (usesCoupon) couponUses++;

      const order = await OrderModel.create(
        {
          userId: customer.id,
          status,
          paymentMethod: 'COD',
          paymentStatus: status === 'DELIVERED' ? 'PAID' : 'PENDING',
          subtotal,
          discount,
          shippingFee: 0,
          tax: 0,
          total: subtotal - discount,
          couponCode: usesCoupon ? COUPON_CODE : null,
          recipientName: `${customer.lastName} ${customer.firstName}`,
          phone: customer.phone || `09${faker.string.numeric(8)}`,
          address: customer.address || faker.location.streetAddress(),
          ward: `Phường ${faker.number.int({ min: 1, max: 15 })}`,
          district: `Quận ${faker.number.int({ min: 1, max: 12 })}`,
          city: faker.helpers.arrayElement(CITIES),
          createdAt,
          updatedAt: createdAt,
        },
        // silent keeps the back-dated updatedAt instead of the current time
        { silent: true },
      );
      await OrderItemModel.bulkCreate(lines.map((line) => ({ ...line, orderId: order.id })));
    }
    await CouponModel.increment('usageCount', { by: couponUses, where: { code: COUPON_CODE } });
    Logger.INFO(`${ORDER_COUNT} orders seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the order table:', error);
  }
};
