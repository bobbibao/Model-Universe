import { Op } from 'sequelize';
import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import OrderModel from '../models/Order.Model';
import OrderItemModel from '../models/OrderItem.Model';
import ProductModel from '../models/Product.Model';
import StockImportItemModel from '../models/StockImportItem.Model';
import ReturnRequestModel from '../models/ReturnRequest.Model';
import ReturnItemModel, { ReturnCondition, ReturnReason } from '../models/ReturnItem.Model';
import UserModel from '../../internal/models/User.Model';
import { deliveryDate } from './Order.Seeder';

// Demo returns. Like the other seeders, nothing here changes stock or `sold`.
// - Background: some old delivered orders (delivered 45+ days ago) have received returns, so their receipt dates
//   fall outside the CI agent's 30-day window and do not trigger anything on their own.
// - Admin work: a few waiting and one rejected request on recently delivered orders (the agent ignores both).
// - Signal: SIGNAL_PRODUCTS products without stock-import history (so the dead-stock candidates are untouched) get
//   recent delivered orders and 3-4 received returned units each: a return rate far above the agent's 8% threshold.

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKGROUND_MIN_AGE_DAYS = 45;
const BACKGROUND_RETURN_PROBABILITY = 0.12;
const WAITING_REQUESTS = 2;
const SIGNAL_PRODUCTS = 3;
const SIGNAL_ORDERS_PER_PRODUCT = 4;
const SIGNAL_REASONS: ReturnReason[] = ['wrong_size', 'wrong_size', 'defective'];
const CITIES = ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng'];

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const daysAfter = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

const randomCondition = (): ReturnCondition =>
  faker.helpers.weightedArrayElement([
    { weight: 50, value: 'new' as ReturnCondition },
    { weight: 35, value: 'open_box' as ReturnCondition },
    { weight: 15, value: 'damaged' as ReturnCondition },
  ]);

const randomReason = (): ReturnReason =>
  faker.helpers.weightedArrayElement([
    { weight: 40, value: 'wrong_size' as ReturnReason },
    { weight: 20, value: 'defective' as ReturnReason },
    { weight: 20, value: 'not_as_described' as ReturnReason },
    { weight: 15, value: 'changed_mind' as ReturnReason },
    { weight: 5, value: 'other' as ReturnReason },
  ]);

// Signal returns are mostly resellable; the first unit of a "defective" product arrived damaged.
const signalCondition = (reason: ReturnReason, first: boolean): ReturnCondition =>
  reason === 'defective' && first
    ? 'damaged'
    : faker.helpers.weightedArrayElement([
        { weight: 60, value: 'new' as ReturnCondition },
        { weight: 40, value: 'open_box' as ReturnCondition },
      ]);

// Full refund for resellable goods; half (rounded to 1,000 VND) for damaged ones, unless the product was defective.
const refundFor = (unitPrice: number, quantity: number, condition: ReturnCondition, reason: ReturnReason) =>
  condition === 'damaged' && reason !== 'defective'
    ? Math.round((unitPrice * quantity) / 2 / 1000) * 1000
    : unitPrice * quantity;

interface SeedReturn {
  order: OrderModel;
  line: OrderItemModel;
  quantity: number;
  reason: ReturnReason;
  status: 'REQUESTED' | 'RECEIVED' | 'REJECTED';
  requestedAt: Date;
  receivedAt?: Date;
  condition?: ReturnCondition;
  adminId: number;
}

const createReturn = async (seed: SeedReturn) => {
  const processedAt = seed.status === 'REQUESTED' ? null : (seed.receivedAt ?? daysAfter(seed.requestedAt, 2));
  const request = await ReturnRequestModel.create(
    {
      orderId: seed.order.id,
      userId: seed.order.userId,
      status: seed.status,
      adminNote: seed.status === 'REJECTED' ? 'Sản phẩm đã qua sử dụng, không đủ điều kiện trả hàng.' : null,
      receivedAt: seed.status === 'RECEIVED' ? seed.receivedAt : null,
      processedAt,
      processedBy: seed.status === 'REQUESTED' ? null : seed.adminId,
      createdAt: seed.requestedAt,
      updatedAt: processedAt ?? seed.requestedAt,
    },
    { silent: true },
  );
  const received = seed.status === 'RECEIVED' && seed.condition;
  await ReturnItemModel.create({
    returnRequestId: request.id,
    orderItemId: seed.line.id,
    quantity: seed.quantity,
    reason: seed.reason,
    condition: received ? seed.condition : null,
    refundAmount: received
      ? refundFor(seed.line.unitPrice, seed.quantity, seed.condition as ReturnCondition, seed.reason)
      : null,
  });
};

// A delivered single-line order of one product, placed `ageDays` ago.
const createDeliveredOrder = async (customer: UserModel, product: ProductModel, ageDays: number) => {
  const createdAt = daysAgo(ageDays);
  const quantity = faker.number.int({ min: 1, max: 2 });
  const subtotal = product.price * quantity;
  const order = await OrderModel.create(
    {
      userId: customer.id,
      status: 'DELIVERED',
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      subtotal,
      discount: 0,
      shippingFee: 0,
      tax: 0,
      total: subtotal,
      recipientName: `${customer.lastName} ${customer.firstName}`,
      phone: customer.phone || `09${faker.string.numeric(8)}`,
      address: customer.address || faker.location.streetAddress(),
      city: faker.helpers.arrayElement(CITIES),
      deliveredAt: deliveryDate(createdAt),
      createdAt,
      updatedAt: createdAt,
    },
    { silent: true },
  );
  const size = product.availableSizes.length > 0 ? faker.helpers.arrayElement(product.availableSizes) : '';
  const line = await OrderItemModel.create({
    orderId: order.id,
    productId: product.id,
    productName: product.name,
    imageUrl: product.imageUrl,
    size,
    quantity,
    unitPrice: product.price,
    createdAt,
    updatedAt: createdAt,
  });
  return { order, line };
};

const firstLineOf = async (order: OrderModel) => OrderItemModel.findOne({ where: { orderId: order.id } });

export const seedReturnData = async (): Promise<void> => {
  try {
    const admin = await UserModel.findOne({ where: { role: 'ADMIN' } });
    const customers = await UserModel.findAll({ where: { role: 'USER' } });
    if (!admin || customers.length === 0) {
      Logger.WARN('No admin or customers found: returns were not seeded.');
      return;
    }
    let received = 0;

    // Background: old delivered orders.
    const oldOrders = await OrderModel.findAll({
      where: { status: 'DELIVERED', deliveredAt: { [Op.lte]: daysAgo(BACKGROUND_MIN_AGE_DAYS) } },
    });
    for (const order of oldOrders) {
      if (!faker.datatype.boolean({ probability: BACKGROUND_RETURN_PROBABILITY })) continue;
      const line = await firstLineOf(order);
      if (!line || !order.deliveredAt) continue;
      const requestedAt = daysAfter(order.deliveredAt, faker.number.int({ min: 1, max: 5 }));
      await createReturn({
        order,
        line,
        quantity: faker.number.int({ min: 1, max: line.quantity }),
        reason: randomReason(),
        status: 'RECEIVED',
        requestedAt,
        receivedAt: daysAfter(requestedAt, faker.number.int({ min: 1, max: 4 })),
        condition: randomCondition(),
        adminId: admin.id,
      });
      received++;
    }

    // Admin work: waiting and rejected requests on recently delivered orders.
    const recentOrders = await OrderModel.findAll({
      where: { status: 'DELIVERED', deliveredAt: { [Op.gt]: daysAgo(20) } },
      order: [['deliveredAt', 'DESC']],
      limit: WAITING_REQUESTS + 1,
    });
    for (const [index, order] of recentOrders.entries()) {
      const line = await firstLineOf(order);
      if (!line || !order.deliveredAt) continue;
      await createReturn({
        order,
        line,
        quantity: 1,
        reason: randomReason(),
        status: index < WAITING_REQUESTS ? 'REQUESTED' : 'REJECTED',
        requestedAt: new Date(Math.min(Date.now(), daysAfter(order.deliveredAt, 1).getTime())),
        adminId: admin.id,
      });
    }

    // Signal: products without stock-import history get recent sales and a burst of received returns.
    const importedIds = (await StockImportItemModel.findAll({ attributes: ['productId'] })).map((row) => row.productId);
    const candidates = await ProductModel.findAll({
      where: { isArchived: false, stock: { [Op.gt]: 0 }, id: { [Op.notIn]: importedIds.length ? importedIds : [0] } },
    });
    const signalProducts: ProductModel[] = faker.helpers.arrayElements(candidates, SIGNAL_PRODUCTS);
    for (const [index, product] of signalProducts.entries()) {
      const sales = [];
      for (let n = 0; n < SIGNAL_ORDERS_PER_PRODUCT; n++) {
        sales.push(
          await createDeliveredOrder(
            faker.helpers.arrayElement(customers),
            product,
            faker.number.int({ min: 12, max: 26 }),
          ),
        );
      }
      const target = faker.number.int({ min: 3, max: 4 });
      let returned = 0;
      for (const { order, line } of sales) {
        if (returned >= target || !order.deliveredAt) break;
        const quantity = Math.min(line.quantity, target - returned);
        const reason = SIGNAL_REASONS[index % SIGNAL_REASONS.length]; // one dominant reason per product
        const deliveredAt = order.deliveredAt.getTime();
        const receivedAt = new Date(
          Math.max(deliveredAt + DAY_MS, daysAgo(faker.number.int({ min: 3, max: 7 })).getTime()),
        );
        await createReturn({
          order,
          line,
          quantity,
          reason,
          status: 'RECEIVED',
          requestedAt: new Date(Math.max(deliveredAt, receivedAt.getTime() - 2 * DAY_MS)),
          receivedAt,
          condition: signalCondition(reason, returned === 0),
          adminId: admin.id,
        });
        returned += quantity;
        received++;
      }
    }
    Logger.INFO(
      `${received} received returns seeded (${signalProducts.map((product) => product.sku).join(', ')} with a high return rate).`,
    );
  } catch (error) {
    Logger.ERROR('Error seeding the return tables:', error);
  }
};
