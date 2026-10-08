import DatabaseProvider from '../database/Database.Provider';
import UserModel from '../database/internal/models/User.Model';
import CustomerAddressModel from '../database/client/models/CustomerAddress.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { validateShipping } from '../../../shared/server/utils/ShippingValidation';

export default class CustomerAddressService {
  async list(userId: number) {
    const user = await UserModel.findByPk(userId);
    if (!user?.isActive) throw HttpError.forbidden();
    return CustomerAddressModel.findAll({ where: { userId }, attributes: ['id', 'label', 'shipping', 'version'], order: [['id', 'DESC']], limit: 20 });
  }
  async save(userId: number, body: Record<string, unknown>) {
    if (body.id !== undefined && (!Number.isSafeInteger(body.id) || Number(body.id) < 1)) throw HttpError.notFound();
    if (typeof body.label !== 'string' || !body.label.trim() || body.label.trim().length > 80 ||
      !body.shipping || typeof body.shipping !== 'object' || Array.isArray(body.shipping))
      throw HttpError.badRequest('Provide an address label and delivery details.', undefined, 'ADDRESS_INVALID');
    const shipping = validateShipping(body.shipping as Record<string, unknown>);
    if (Object.values(shipping).some(value => value && value.length > 500))
      throw HttpError.badRequest('Address fields must be at most 500 characters.', undefined, 'ADDRESS_INVALID');
    if (body.id === undefined && (typeof body.requestKey !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(body.requestKey)))
      throw HttpError.badRequest('Provide a stable address request reference.', undefined, 'ADDRESS_INVALID');
    const id = await DatabaseProvider.getInstance().transaction(async transaction => {
      const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user?.isActive) throw HttpError.forbidden();
      const label = (body.label as string).trim();
      const existing = await CustomerAddressModel.findOne({ where: body.id === undefined ? { userId, requestKey: body.requestKey } : { id: body.id, userId }, transaction, lock: transaction.LOCK.UPDATE });
      if (body.id !== undefined) {
        if (!Number.isSafeInteger(body.id) || Number(body.id) < 1 || !existing) throw HttpError.notFound();
        if (existing.version !== body.expectedVersion) throw HttpError.conflict('Refresh this address before updating it.', 'ADDRESS_CHANGED');
        await existing.update({ label, shipping, version: existing.version + 1 }, { transaction });
        return existing.id;
      }
      if (existing) {
        if (existing.label !== label || Object.entries(shipping).some(([key, value]) => existing.shipping[key as keyof typeof shipping] !== value))
          throw HttpError.conflict('This address reference belongs to a different request.', 'ADDRESS_CHANGED');
        return existing.id;
      }
      if (await CustomerAddressModel.count({ where: { userId }, transaction }) >= 20)
        throw HttpError.conflict('Save at most 20 delivery addresses.', 'ADDRESS_LIMIT');
      return (await CustomerAddressModel.create({ userId, label, shipping, requestKey: body.requestKey }, { transaction })).id;
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
