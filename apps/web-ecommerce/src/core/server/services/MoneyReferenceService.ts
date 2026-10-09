import { QueryTypes, Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';

type MoneyLedger = 'reservation_payment' | 'order_receipt' | 'order_refund' | 'buyback_payout' | 'pawn_payment' | 'partner_guarantee_payment' | 'pawn_disposal_entry';
const LEDGERS: MoneyLedger[] = ['reservation_payment', 'order_receipt', 'order_refund', 'buyback_payout', 'pawn_payment', 'partner_guarantee_payment', 'pawn_disposal_entry'];

// Keep the existing ledgers; serialize their shared actual bank transaction identity before domain locks.
export default class MoneyReferenceService {
  static async lock(externalReference: string, ledger: MoneyLedger, transaction: Transaction) {
    const db = DatabaseProvider.getInstance();
    const reference = externalReference.trim().toUpperCase();
    await db.query('SELECT pg_advisory_xact_lock(836210, hashtext(:reference))', { replacements: { reference }, transaction });
    const rows = await db.query<{ externalReference: string }>(LEDGERS.filter(table => table !== ledger).map(table =>
      `SELECT "externalReference" FROM "${table}" WHERE UPPER("externalReference")=:reference${table === 'reservation_payment' ? " AND kind <> 'forfeit'" : ''}`,
    ).join(' UNION ALL '), { replacements: { reference }, transaction, type: QueryTypes.SELECT });
    if (rows.length) throw HttpError.conflict('This actual transaction reference is already recorded in another money workflow.', 'PAYMENT_REFERENCE_REUSED');
  }
}
