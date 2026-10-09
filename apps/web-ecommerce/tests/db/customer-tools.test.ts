import crypto from 'crypto';
import type { Sequelize } from 'sequelize-typescript';
import { seedTestDatabase } from './support/testDb';
import UserModel from '../../src/core/server/database/internal/models/User.Model';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import CommerceNotificationModel from '../../src/core/server/database/client/models/CommerceNotification.Model';
import RestockSubscriptionModel from '../../src/core/server/database/client/models/RestockSubscription.Model';
import CustomerAddressModel from '../../src/core/server/database/client/models/CustomerAddress.Model';
import CustomerAddressService from '../../src/core/server/services/CustomerAddressService';
import CustomerNotificationService from '../../src/core/server/services/CustomerNotificationService';
import OrderService from '../../src/core/server/services/OrderService';
import ProductService from '../../src/core/server/services/ProductService';

describe('customer address snapshots and durable stock alerts', () => {
  let db: Sequelize, userId: number, otherId: number, product: ProductModel;
  const addresses = new CustomerAddressService(), notifications = new CustomerNotificationService();
  const shipping = { recipientName: 'Synthetic Collector', phone: '0901234567', address: '12 Synthetic Delivery Road', ward: 'Fixture Ward', district: 'Fixture District', city: 'Fixture City', note: '' };
  beforeAll(async () => {
    db = await seedTestDatabase();
    [userId, otherId] = (await UserModel.findAll({ where: { role: 'USER', isActive: true }, order: [['id', 'ASC']], limit: 2 })).map(user => user.id);
    const source = (await ProductModel.findOne({ where: { condition: 'new', isArchived: false } }))!;
    product = await ProductModel.create({ name: 'Synthetic restock and finder fixture', sku: 'CUSTOMER-TOOLS-FIXTURE', brandName: 'Fixture Manufacturer', categoryId: source.categoryId,
      price: 200000, importPrice: 0, stock: 3, sold: 0, imageUrl: source.imageUrl, condition: 'new', assemblyState: 'unassembled', grade: 'HG', availableSizes: [], gender: 'unisex' });
  }, 120000);
  afterAll(async () => { await db?.close(); });

  it('serializes retried address creation without trusting a client owner or producing duplicate rows', async () => {
    const body = { label: 'Synthetic home', shipping, requestKey: crypto.randomUUID(), userId: otherId };
    const [first, second] = await Promise.all([addresses.save(userId, body), addresses.save(userId, body)]);
    expect(first.id).toBe(second.id); expect(await CustomerAddressModel.count({ where: { userId } })).toBe(1);
    expect((await addresses.list(otherId))).toEqual([]);
    await expect(addresses.save(userId, { ...body, label: 'Different address request' })).rejects.toMatchObject({ code: 'ADDRESS_CHANGED' });
    await expect(addresses.save(userId, { ...body, shipping: { ...shipping, phone: 'invalid' } })).rejects.toMatchObject({ statusCode: 400 });
  });
  it('isolates address updates and removal and preserves the destination already snapshotted on an order', async () => {
    let row = (await addresses.list(userId))[0];
    const order = await new OrderService().placeOrder(userId, { items: [{ productId: product.id, quantity: 1, size: '' }], shipping: row.shipping, expectedTotal: product.price, requestKey: crypto.randomUUID() });
    await expect(addresses.save(otherId, { id: row.id, label: 'Stolen', shipping, expectedVersion: row.version })).rejects.toMatchObject({ statusCode: 404 });
    await expect(addresses.remove(otherId, row.id, row.version)).rejects.toMatchObject({ statusCode: 404 });
    row = await addresses.save(userId, { id: row.id, label: 'New home', shipping: { ...shipping, address: '34 New Synthetic Road' }, expectedVersion: row.version });
    await expect(addresses.remove(userId, row.id, row.version - 1)).rejects.toMatchObject({ code: 'ADDRESS_CHANGED' });
    await addresses.remove(userId, row.id, row.version);
    expect((await new OrderService().getForUser(userId, order.id)).address).toBe(shipping.address);
    expect(await addresses.list(userId)).toEqual([]);
  });
  it('enforces the 20-address limit under simultaneous submissions', async () => {
    for (let i = 0; i < 19; i++) await addresses.save(otherId, { label: `Synthetic address ${i}`, shipping, requestKey: crypto.randomUUID() });
    const result = await Promise.allSettled([0, 1].map(i => addresses.save(otherId, { label: `Concurrent fixture ${i}`, shipping, requestKey: crypto.randomUUID() })));
    expect(result.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(row => row.status === 'rejected')).toHaveLength(1);
    expect(await CustomerAddressModel.count({ where: { userId: otherId } })).toBe(20);
  });
  it('accepts one durable preference only for a public sold-out model', async () => {
    await expect(notifications.subscribe(userId, product.id, true)).rejects.toMatchObject({ code: 'RESTOCK_AVAILABLE' });
    await product.update({ stock: 0 });
    await Promise.all([notifications.subscribe(userId, product.id, true), notifications.subscribe(userId, product.id, true)]);
    expect(await RestockSubscriptionModel.count({ where: { userId, productId: product.id } })).toBe(1);
    await expect(notifications.subscribe(otherId, product.id, 'true')).rejects.toMatchObject({ statusCode: 400 });
    await product.update({ isArchived: true });
    await expect(notifications.subscribe(otherId, product.id, true)).rejects.toMatchObject({ statusCode: 404 });
    await product.update({ stock: 1 });
    expect(await notifications.runRestocks()).toBe(0);
    await product.update({ isArchived: false, inventoryStatus: 'quarantine' });
    expect(await notifications.runRestocks()).toBe(0);
    await product.update({ inventoryStatus: 'available', listingStatus: 'hidden' });
    expect(await notifications.runRestocks()).toBe(0);
  });
  it('atomically delivers one inbox notification under parallel scheduler runs and survives another run', async () => {
    await product.update({ listingStatus: 'published' });
    const counts = await Promise.all([notifications.runRestocks(), notifications.runRestocks()]);
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(await notifications.runRestocks()).toBe(0);
    const row = (await notifications.list(userId)).rows.find(row => row.kind === 'restock')!;
    expect(row.details.productName).toBe(product.name); expect(row.details.observedStock).toBe(1);
    expect((await notifications.subscriptions(userId))[0].active).toBe(false);
    await expect(notifications.read(otherId, row.id)).rejects.toMatchObject({ statusCode: 404 });
    await notifications.read(userId, row.id); await notifications.read(userId, row.id);
    expect((await CommerceNotificationModel.findByPk(row.id))!.readAt).toBeTruthy();
  });
  it('respects unsubscribe and rearms only after a new sold-out cycle', async () => {
    await product.update({ stock: 0 });
    await notifications.subscribe(userId, product.id, true);
    await notifications.subscribe(userId, product.id, false);
    await product.update({ stock: 1 }); expect(await notifications.runRestocks()).toBe(0);
    await product.update({ stock: 0 }); await notifications.subscribe(userId, product.id, true);
    await product.update({ stock: 1 }); expect(await notifications.runRestocks()).toBe(1);
    expect(await CommerceNotificationModel.count({ where: { userId, kind: 'restock' } })).toBe(2);
    expect((await RestockSubscriptionModel.findOne({ where: { userId, productId: product.id } }))!.cycle).toBe(3);
  });
  it('blocks inactive accounts and never exposes another customer inbox', async () => {
    expect((await notifications.list(otherId)).rows.every(row => row.userId === otherId)).toBe(true);
    await UserModel.update({ isActive: false }, { where: { id: userId } });
    await expect(addresses.list(userId)).rejects.toMatchObject({ statusCode: 403 });
    await expect(notifications.subscribe(userId, product.id, false)).rejects.toMatchObject({ statusCode: 403 });
    await expect(notifications.list(userId)).rejects.toMatchObject({ statusCode: 403 });
    await UserModel.update({ isActive: true }, { where: { id: userId } });
  });
  it('filters finder matches by actual assembly, stock, grade and budget and rejects unsupported states', async () => {
    const products = new ProductService(), query = { assemblyState: 'unassembled', grade: 'HG', condition: 'new', inStock: true, maxPrice: 200000, limit: 100, offset: 0 };
    const matches = await products.listPublic(query);
    expect(matches.rows.some(row => row.id === product.id)).toBe(true);
    expect((await products.listPublic({ ...query, assemblyState: 'assembled' })).rows.some(row => row.id === product.id)).toBe(false);
    expect((await products.listPublic({ ...query, maxPrice: 199999 })).rows.some(row => row.id === product.id)).toBe(false);
    await expect(products.listPublic({ ...query, assemblyState: 'invented' })).rejects.toMatchObject({ statusCode: 400 });
  });
  it('archives merchandise with saved stock preferences and preserves its notification history', async () => {
    expect(await new ProductService().remove(product.id)).toEqual({ archived: true });
    expect((await product.reload()).isArchived).toBe(true);
    expect((await notifications.subscriptions(userId))[0].product).toBeNull();
    expect(await CommerceNotificationModel.count({ where: { userId, kind: 'restock' } })).toBe(2);
  });
});
