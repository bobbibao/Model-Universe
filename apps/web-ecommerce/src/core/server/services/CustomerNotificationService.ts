import { Op, QueryTypes } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import ProductModel, { isSellable } from '../database/client/models/Product.Model';
import CommerceNotificationModel from '../database/client/models/CommerceNotification.Model';
import RestockSubscriptionModel from '../database/client/models/RestockSubscription.Model';
import HttpError from '../../../shared/server/utils/HttpError';

export default class CustomerNotificationService {
  private async actor(userId: number) {
    const user = await UserModel.findByPk(userId);
    if (!user?.isActive) throw HttpError.forbidden();
  }
  async list(userId: number, offset = 0) {
    await this.actor(userId);
    if (!Number.isSafeInteger(offset) || offset < 0) throw HttpError.badRequest('Invalid notification offset.');
    return CommerceNotificationModel.findAndCountAll({ where: { userId }, limit: 30, offset, order: [['id', 'DESC']] });
  }
  async read(userId: number, id: number) {
    await this.actor(userId);
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound();
    const row = await CommerceNotificationModel.findOne({ where: { id, userId } });
    if (!row) throw HttpError.notFound();
    if (!row.readAt) await CommerceNotificationModel.update({ readAt: new Date() }, { where: { id, userId, readAt: null } });
    return { read: true };
  }
  async subscriptions(userId: number) {
    await this.actor(userId);
    const rows = await RestockSubscriptionModel.findAll({ where: { userId }, limit: 100, order: [['id', 'DESC']] });
    const products = await ProductModel.findAll({ where: { id: { [Op.in]: rows.map(row => row.productId) } }, attributes: ['id', 'name', 'descriptionEn', 'descriptionVi', 'stock', 'isArchived', 'inventoryStatus', 'listingStatus', 'partnerId'] });
    const byId = new Map(products.map(product => [product.id, product]));
    return rows.map(row => {
      const product = byId.get(row.productId);
      return { ...row.toJSON(), product: product && isSellable(product) ? { id: product.id, name: product.name, stock: product.stock } : null };
    });
  }
  async subscribe(userId: number, productId: number, active: unknown) {
    if (!Number.isSafeInteger(productId) || productId < 1) throw HttpError.notFound();
    if (typeof active !== 'boolean') throw HttpError.badRequest('Choose a restock notification preference.');
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user?.isActive) throw HttpError.forbidden();
      const row = await RestockSubscriptionModel.findOne({ where: { userId, productId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!active) { if (row) await row.update({ active: false }, { transaction }); return; }
      if (row?.active) return;
      const product = await ProductModel.findByPk(productId, { transaction });
      if (!product || !isSellable(product)) throw HttpError.notFound();
      if (product.stock > 0) throw HttpError.conflict('This item is already available. Review its current stock.', 'RESTOCK_AVAILABLE');
      if (!row && await RestockSubscriptionModel.count({ where: { userId }, transaction }) >= 100)
        throw HttpError.conflict('Follow at most 100 stock alerts.', 'RESTOCK_LIMIT');
      if (row) await row.update({ active: true, cycle: row.cycle + 1, notifiedAt: null }, { transaction });
      else await RestockSubscriptionModel.create({ userId, productId }, { transaction });
    });
    return this.subscriptions(userId);
  }
  // Notifications are in the customer inbox. No email/SMS delivery or stock reservation is implied.
  async runRestocks(now = new Date()) {
    // Process only available public merchandise; a permanently sold-out subscription cannot starve later alerts.
    const rows = await DatabaseProvider.getInstance().query<{ id: number }>(`
      SELECT s.id FROM restock_subscription s JOIN product p ON p.id=s."productId" JOIN "user" u ON u.id=s."userId"
      WHERE s.active=true AND u."isActive"=true AND p.stock>0 AND p."isArchived"=false
        AND p."inventoryStatus"='available' AND p."listingStatus"='published'
      ORDER BY s.id ASC LIMIT 500`, { type: QueryTypes.SELECT });
    let notified = 0;
    for (const candidate of rows) {
      await DatabaseProvider.getInstance().transaction(async transaction => {
        const row = await RestockSubscriptionModel.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!row?.active) return;
        const user = await UserModel.findByPk(row.userId, { transaction });
        const product = await ProductModel.findByPk(row.productId, { transaction });
        if (!user?.isActive || !product || !isSellable(product) || product.stock < 1) return;
        const dedupeKey = `restock:${row.id}:${row.cycle}`;
        const [, created] = await CommerceNotificationModel.findOrCreate({ where: { dedupeKey }, defaults: {
          dedupeKey, userId: row.userId, kind: 'restock', entityId: row.productId,
          details: { productName: product.name, observedStock: product.stock, observedAt: now.toISOString() },
        }, transaction });
        await row.update({ active: false, notifiedAt: now }, { transaction });
        if (created) notified++;
      });
    }
    return notified;
  }
}
