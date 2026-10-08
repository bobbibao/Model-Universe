import { Op } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import PawnContractModel from '../database/client/models/PawnContract.Model';
import CommerceNotificationModel from '../database/client/models/CommerceNotification.Model';
import { PAWN_DAY_MS } from '../../../shared/pawn-rules';

export default class PawnReminderService {
  async run(now = new Date()) {
    const dueContracts = await PawnContractModel.findAll({
      where: { status: 'active', dueAt: { [Op.lte]: new Date(now.getTime() + 3 * PAWN_DAY_MS) } },
      attributes: ['id'],
    });
    for (const candidate of dueContracts) {
      await DatabaseProvider.getInstance().transaction(async transaction => {
        const row = await PawnContractModel.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!row || row.status !== 'active' || !row.dueAt || row.dueAt.getTime() > now.getTime() + 3 * PAWN_DAY_MS) return;
        const overdue = row.dueAt < now;
        const days = overdue ? 0 : row.dueAt.getTime() - now.getTime() <= PAWN_DAY_MS ? 1 : 3;
        const kind = overdue ? 'pawn_overdue' : 'pawn_due';
        const dedupeKey = `pawn:${row.id}:${row.dueAt.toISOString()}:${kind}:${days}`;
        await CommerceNotificationModel.findOrCreate({
          where: { dedupeKey }, transaction,
          defaults: { dedupeKey, userId: row.userId, kind, entityId: row.id, details: { days, dueAt: row.dueAt, extensionPending: !!row.extensionRequest } },
        });
      });
    }
  }
}
