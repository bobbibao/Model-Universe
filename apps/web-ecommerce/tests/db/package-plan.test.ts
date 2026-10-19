import crypto from 'crypto';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import OrderService from '../../src/core/server/services/OrderService';
import FulfillmentService from '../../src/core/server/services/FulfillmentService';
import PackingService from '../../src/core/server/services/PackingService';
import ShippingService from '../../src/core/server/services/ShippingService';
import NotificationDispatchService from '../../src/core/server/services/NotificationDispatchService';
import ConversionService from '../../src/core/server/services/marketing/ConversionService';
import { planItems } from '../../src/core/server/services/PackagePlanService';
import CartService from '../../src/core/server/services/CartService';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductDiscountModel from '../../src/core/server/database/client/models/ProductDiscount.Model';
import OrderItemModel from '../../src/core/server/database/client/models/OrderItem.Model';
import OrderPackagePlanModel from '../../src/core/server/database/client/models/OrderPackagePlan.Model';
import ShippingCartonModel from '../../src/core/server/database/client/models/ShippingCarton.Model';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import { estimateFeeByWeightVnd } from '../../src/shared/fulfillment';
import * as SuperAi from '../../src/core/server/services/delivery/SuperAiClient';

const address = {
  provinceCode: '79',
  provinceName: 'Thành phố Hồ Chí Minh',
  districtCode: '760',
  districtName: 'Quận 1',
  communeCode: '26734',
  communeName: 'Phường Bến Thành',
  street: '12 Lê Lợi',
};
const shipping = {
  recipientName: 'Fixture Collector',
  phone: '0901234567',
  address: '12 Fixture Road',
  city: 'Fixture City',
};

// The package optimizer at checkout and order placement (src/shared/packing; without SuperAI the local estimate).
describe('package plans on disposable PostgreSQL', () => {
  let db: Sequelize, kit: ProductModel, heavy: ProductModel, adminId: number, userId: number;
  const orders = new OrderService(),
    packing = new PackingService();
  const quote = async (items: { productId: number; quantity: number }[]) => {
    const { lines, products } = await new CartService().resolveLines(items.map((item) => ({ ...item, size: '' })));
    return new ShippingService().quote({ items: planItems(lines, products), address });
  };

  beforeAll(async () => {
    jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
    jest.spyOn(NotificationDispatchService.prototype, 'dispatchSoon').mockReturnValue(undefined);
    jest.spyOn(FulfillmentService.prototype, 'autoCreateShipment').mockResolvedValue(null);
    db = await seedTestDatabase();
    [kit, heavy] = await ProductModel.findAll({
      where: { condition: 'new', isArchived: false, partnerId: null },
      order: [['id', 'ASC']],
      limit: 2,
    });
    await kit.update({
      price: 900_000,
      stock: 50,
      inventoryStatus: 'available',
      packaging: { lengthCm: 32, widthCm: 20, heightCm: 8, weightGram: 400, fragile: true, orientation: 'flat' },
    });
    await heavy.update({
      price: 2_000_000,
      stock: 50,
      inventoryStatus: 'available',
      packaging: { lengthCm: 30, widthCm: 20, heightCm: 10, weightGram: 4_000, fragile: false, orientation: 'any' },
    });
    await ProductDiscountModel.destroy({ where: { productId: [kit.id, heavy.id] } });
    userId = (await UserModel.findOne({ where: { role: 'USER', isActive: true }, order: [['id', 'ASC']] }))!.id;
    adminId = (await UserModel.findOne({ where: { role: 'ADMIN', isActive: true } }))!.id;
  }, 600_000);
  afterAll(() => db.close());

  it('seeds the carton catalog and keeps the settings and cartons staff-only and validated', async () => {
    expect(await ShippingCartonModel.count({ where: { active: true } })).toBeGreaterThanOrEqual(5);
    const config = packing.configView(await packing.config());
    await expect(packing.saveConfig(userId, config)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      packing.saveConfig(adminId, { ...config, settings: { ...config.settings, maxParcelsPerOrder: 0 } }),
    ).rejects.toMatchObject({ code: 'PACKING_INVALID' });
    const saved = await packing.saveConfig(adminId, {
      ...config,
      carriers: config.carriers.map((row) => (row.key === '10' ? { ...row, verified: true } : row)),
    });
    expect(saved.carriers.find((row) => row.key === '10')).toMatchObject({ verified: true, volumetricDivisor: 6000 });
    // Grade keys survive the round trip (they are sent as a list).
    expect(saved.grades.map((row) => row.grade)).toContain('RE/100');
    await expect(
      packing.saveCarton(adminId, {
        code: 'C-BAD',
        name: 'Bad',
        innerLengthCm: 30,
        innerWidthCm: 20,
        innerHeightCm: 10,
        outerLengthCm: 20,
        outerWidthCm: 22,
        outerHeightCm: 12,
        tareWeightGram: 100,
        costVnd: 0,
        maxLoadGram: 5_000,
      }),
    ).rejects.toMatchObject({ code: 'PACKING_INVALID' });
  });

  it('quotes the cheapest plan and records it, with its order items, on the new order', async () => {
    const single = await quote([{ productId: kit.id, quantity: 1 }]);
    expect(single.plan!.parcels).toHaveLength(1);
    expect(single.feeVnd).toBe(estimateFeeByWeightVnd(single.plan!.parcels[0].billableWeightGram));
    const order = await orders.placeOrder(userId, {
      items: [
        { productId: kit.id, quantity: 2, size: '' },
        { productId: heavy.id, quantity: 1, size: '' },
      ],
      shipping,
      paymentPlan: 'deposit',
      fulfillmentMethod: 'COURIER_COD',
      deliveryAddress: address,
      requestKey: `plan-${crypto.randomUUID()}`,
    });
    const plan = order.shippingQuote!.plan!;
    expect(order.shippingFee).toBe(plan.carrierFeeVnd);
    const stored = (await OrderPackagePlanModel.findOne({ where: { orderId: order.id } }))!;
    expect(stored).toMatchObject({ version: 1, status: 'PROPOSED', chargedFeeVnd: order.shippingFee });
    const itemIds = (await OrderItemModel.findAll({ where: { orderId: order.id } })).map((item) => item.id).sort();
    const planned = stored.plan!.parcels.flatMap((parcel) => parcel.items);
    expect([...new Set(planned.map((item) => item.orderItemId))].sort()).toEqual(itemIds);
    expect(planned.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
  });

  it('splits an order heavier than the carrier limit into parcels within it', async () => {
    const big = await quote([{ productId: heavy.id, quantity: 7 }]);
    const parcels = big.plan!.parcels;
    expect(parcels.length).toBeGreaterThanOrEqual(2);
    for (const parcel of parcels) expect(parcel.actualWeightGram).toBeLessThanOrEqual(20_000);
    expect(big.feeVnd).toBe(parcels.reduce((sum, parcel) => sum + parcel.feeVnd, 0));
  });

  it('prices every parcel with SuperAI and picks the cheapest plan and carrier, using each carrier divisor', async () => {
    await new ShippingService().saveOrigin(adminId, {
      warehouseCode: 'WH-FIXTURE',
      provinceName: 'Thành phố Hồ Chí Minh',
      districtName: 'Quận 3',
      viewConfig: '1',
      defaultPackage: { weightGram: 1200, lengthCm: 40, widthCm: 30, heightCm: 15 },
    });
    const calls: { weightGram: number; valueVnd: number }[] = [];
    jest.spyOn(SuperAi, 'superAiConfigured').mockReturnValue(true);
    jest.spyOn(SuperAi, 'price').mockImplementation(async (input) => {
      calls.push({ weightGram: input.weightGram, valueVnd: input.valueVnd });
      const row = (carrierId: number, carrierName: string, fee: number) => ({
        carrierId,
        carrierName,
        shipmentFeeVnd: fee,
        insuranceFeeVnd: Math.round(input.valueVnd * 0.005),
        feeVnd: fee + Math.round(input.valueVnd * 0.005),
        estimatedPickup: null,
        estimatedDelivery: 'Khoảng 2 - 3 ngày',
      });
      return [
        row(10, 'SPX Express', 15_000 + 3_000 * Math.ceil(input.weightGram / 1_000)),
        row(2, 'GHN', 20_000 + 2_000 * Math.ceil(input.weightGram / 500)),
      ];
    });
    try {
      const result = await quote([{ productId: kit.id, quantity: 2 }]);
      expect(result.source).toBe('superai');
      expect(result.options.map((option) => option.carrierId).sort((a, b) => a - b)).toEqual([2, 10]);
      expect(result.carrier!.feeVnd).toBe(Math.min(...result.options.map((option) => option.feeVnd)));
      expect(result.plan!.carrierId).toBe(result.carrier!.carrierId);
      expect(result.feeVnd).toBe(result.plan!.parcels.reduce((sum, parcel) => sum + parcel.feeVnd, 0));
      // Every call names the parcel's own billable weight and goods value (insurance).
      for (const parcel of result.plan!.parcels)
        expect(calls).toContainEqual({ weightGram: parcel.billableWeightGram, valueVnd: parcel.goodsValueVnd });
      // A second quote for the same bag is answered from the price cache.
      const before = calls.length;
      await quote([{ productId: kit.id, quantity: 2 }]);
      expect(calls.length).toBe(before);
    } finally {
      jest.restoreAllMocks();
      jest.spyOn(ConversionService.prototype, 'recordPurchase').mockResolvedValue(undefined as never);
      jest.spyOn(NotificationDispatchService.prototype, 'dispatchSoon').mockReturnValue(undefined);
      jest.spyOn(FulfillmentService.prototype, 'autoCreateShipment').mockResolvedValue(null);
    }
  });

  it('asks the shop to arrange delivery when no carton fits', async () => {
    await ShippingCartonModel.update({ active: false }, { where: {} });
    try {
      await expect(quote([{ productId: kit.id, quantity: 1 }])).rejects.toMatchObject({ code: 'PACKING_REVIEW' });
    } finally {
      await ShippingCartonModel.update({ active: true }, { where: {} });
    }
  });
});
