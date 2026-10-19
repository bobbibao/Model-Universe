import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import CustomerAddressModel from '../database/client/models/CustomerAddress.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { validateShipping } from '../../../shared/server/utils/ShippingValidation';
import { createHash } from 'crypto';
import type { Transaction } from 'sequelize';
import { formatDeliveryAddress, savedAddressKey, type DeliveryAddress } from '../../../shared/fulfillment';
import ShippingService from './ShippingService';

export default class CustomerAddressService {
  async list(userId: number) {
    const user = await UserModel.findByPk(userId);
    if (!user?.isActive) throw HttpError.forbidden();
    return CustomerAddressModel.findAll({ where: { userId }, attributes: ['id', 'label', 'shipping', 'delivery', 'version'], order: [['updatedAt', 'DESC'], ['id', 'DESC']], limit: 20 });
  }

  // The user's saved row for the same recipient, phone and place, however it was saved (address book or checkout).
  private async sameAddress(userId: number, key: string, transaction?: Transaction, exceptId?: number) {
    const rows = await CustomerAddressModel.findAll({ where: { userId }, order: [['updatedAt', 'DESC'], ['id', 'DESC']], transaction });
    return rows.find(row => row.id !== exceptId && savedAddressKey(row.shipping, row.delivery) === key) ?? null;
  }

  // After a paid checkout: the delivery address joins the address book unless the same recipient, phone and address
  // are already there (then that row moves to the top). Silently skipped when the book is full.
  async remember(userId: number, shipping: Record<string, string>, delivery: DeliveryAddress) {
    const row = {
      recipientName: shipping.recipientName || '',
      phone: shipping.phone || '',
      address: delivery.street,
      ward: delivery.communeName,
      district: delivery.districtName,
      city: delivery.provinceName,
      note: '',
    };
    const key = savedAddressKey(row, delivery);
    const existing = await this.sameAddress(userId, key);
    if (existing) {
      // An older text-only address gains the structured courier address.
      if (!existing.delivery) existing.delivery = delivery;
      existing.changed('updatedAt', true);
      await existing.save();
      return existing;
    }
    if ((await CustomerAddressModel.count({ where: { userId } })) >= 20) return null;
    const requestKey = `checkout-${createHash('sha256').update(key).digest('hex').slice(0, 40)}`;
    const [created] = await CustomerAddressModel.findOrCreate({
      where: { userId, requestKey },
      defaults: { userId, requestKey, label: formatDeliveryAddress(delivery).slice(0, 80), delivery, shipping: row },
    });
    return created;
  }
  async save(userId: number, body: Record<string, unknown>) {
    if (body.id !== undefined && (!Number.isSafeInteger(body.id) || Number(body.id) < 1)) throw HttpError.notFound();
    if (typeof body.label !== 'string' || !body.label.trim() || body.label.trim().length > 80 ||
      !body.shipping || typeof body.shipping !== 'object' || Array.isArray(body.shipping))
      throw HttpError.badRequest('Provide an address label and delivery details.', undefined, 'ADDRESS_INVALID');
    // A structured courier address (address picker) is checked against SuperAI's areas and fills the text lines.
    const delivery = body.delivery === undefined || body.delivery === null ? null : await new ShippingService().validateAddress(body.delivery);
    const shipping = validateShipping({
      ...(body.shipping as Record<string, unknown>),
      ...(delivery ? { address: delivery.street, ward: delivery.communeName, district: delivery.districtName, city: delivery.provinceName } : {}),
    });
    if (Object.values(shipping).some(value => value && value.length > 500))
      throw HttpError.badRequest('Address fields must be at most 500 characters.', undefined, 'ADDRESS_INVALID');
    if (body.id === undefined && (typeof body.requestKey !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(body.requestKey)))
      throw HttpError.badRequest('Provide a stable address request reference.', undefined, 'ADDRESS_INVALID');
    const id = await DatabaseProvider.getInstance().transaction(async transaction => {
      const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user?.isActive) throw HttpError.forbidden();
      const label = (body.label as string).trim();
      const existing = await CustomerAddressModel.findOne({ where: body.id === undefined ? { userId, requestKey: body.requestKey } : { id: body.id, userId }, transaction, lock: transaction.LOCK.UPDATE });
      const key = savedAddressKey(shipping, delivery);
      if (body.id !== undefined) {
        if (!Number.isSafeInteger(body.id) || Number(body.id) < 1 || !existing) throw HttpError.notFound();
        if (existing.version !== body.expectedVersion) throw HttpError.conflict('Refresh this address before updating it.', 'ADDRESS_CHANGED');
        await existing.update({ label, shipping, delivery, version: existing.version + 1 }, { transaction });
        // An edit that makes it the same as another saved address merges the two.
        await (await this.sameAddress(userId, key, transaction, existing.id))?.destroy({ transaction });
        return existing.id;
      }
      if (existing) {
        if (existing.label !== label || Object.entries(shipping).some(([key, value]) => existing.shipping[key as keyof typeof shipping] !== value))
          throw HttpError.conflict('This address reference belongs to a different request.', 'ADDRESS_CHANGED');
        return existing.id;
      }
      // Saving an address that is already in the book updates that row (label, note, map position) instead of adding a copy.
      const same = await this.sameAddress(userId, key, transaction);
      if (same) {
        await same.update({ label, shipping, delivery: delivery ?? same.delivery, version: same.version + 1 }, { transaction });
        return same.id;
      }
      if (await CustomerAddressModel.count({ where: { userId }, transaction }) >= 20)
        throw HttpError.conflict('Save at most 20 delivery addresses.', 'ADDRESS_LIMIT');
      return (await CustomerAddressModel.create({ userId, label, shipping, delivery, requestKey: body.requestKey }, { transaction })).id;
    });
    return (await this.list(userId)).find(row => row.id === id)!;
  }
  async remove(userId: number, id: number, expectedVersion: unknown) {
    await DatabaseProvider.getInstance().transaction(async transaction => {
      const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user?.isActive) throw HttpError.forbidden();
      if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound();
      const row = await CustomerAddressModel.findOne({ where: { id, userId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw HttpError.notFound();
      if (row.version !== expectedVersion) throw HttpError.conflict('Refresh this address before removing it.', 'ADDRESS_CHANGED');
      // Order and reservation destinations are independent immutable transaction snapshots.
      await row.destroy({ transaction });
    });
    return { removed: true };
  }
}
