import { Op } from 'sequelize';
import ReservationModel from '../database/client/models/Reservation.Model';
import CommerceNotificationModel from '../database/client/models/CommerceNotification.Model';
import { DAY_MS } from '../../../shared/reservation';

// Persisted dedupe survives process restarts and multiple server instances.
export default class ReservationReminderService {
  async run(now = new Date()) {
    const rows = await ReservationModel.findAll({ where: { status: { [Op.in]: ['holding','delivery_requested'] }, expiresAt: { [Op.gt]: now, [Op.lte]: new Date(now.getTime() + 3 * DAY_MS) } } });
    for (const row of rows) {
      if (!row.expiresAt || row.paidVnd >= row.totalVnd) continue;
      const days = row.expiresAt.getTime() - now.getTime() <= DAY_MS ? 1 : 3;
      const dedupeKey = `reservation:${row.id}:${row.expiresAt.toISOString()}:${days}`;
      await CommerceNotificationModel.findOrCreate({ where: { dedupeKey }, defaults: { dedupeKey, userId: row.userId, kind: 'reservation_deadline', entityId: row.id, details: { days, expiresAt: row.expiresAt, remainingVnd: row.totalVnd - row.paidVnd } } });
    }
  }
}
