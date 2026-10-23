import { Transaction } from 'sequelize';
import CommercePolicyModel from '../database/client/models/CommercePolicy.Model';
import UserModel from '../database/internal/models/User.Model';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';
import { validatePawnPolicy } from '../../../shared/pawn-rules';
import { RETURN_WINDOW_DAYS } from './ReturnService';
import { DEFAULT_VOUCHER_POLICY, parseVoucherPolicy, type VoucherPolicy } from '../../../shared/voucher-stack';

export type CommercePolicyName = 'reservation' | 'loyalty' | 'pawn' | 'marketplace' | 'buyback' | 'voucher';
const NAMES: CommercePolicyName[] = ['reservation', 'loyalty', 'pawn', 'marketplace', 'buyback', 'voucher'];
export default class CommercePolicyService {
  // The profit guard every voucher is checked with: the latest approved `voucher` policy, or the v6.2 values while none
  // is approved (`version: null`). Orders record the version they were checked with.
  async voucherPolicy(transaction?: Transaction): Promise<{ policy: VoucherPolicy; version: number | null }> {
    const row = await CommercePolicyModel.findOne({ where: { name: 'voucher' }, order: [['version', 'DESC']], transaction });
    if (!row) return { policy: DEFAULT_VOUCHER_POLICY, version: null };
    // A stored row was validated when approved; parsing again keeps a hand-edited row from loosening the guard.
    try { return { policy: parseVoucherPolicy(row.settings), version: row.version }; }
    catch { return { policy: DEFAULT_VOUCHER_POLICY, version: row.version }; }
  }

  async approved(name: CommercePolicyName, transaction?: Transaction) {
    const policy = await CommercePolicyModel.findOne({ where: { name }, order: [['version', 'DESC']], transaction });
    if (!policy) throw HttpError.policyApprovalRequired(name);
    return policy;
  }

  async list() {
    return CommercePolicyModel.findAll({ order: [['name', 'ASC'], ['version', 'DESC']], limit: 100 });
  }

  async approve(name: string, settings: unknown, expectedVersion: number, actorUserId: number, reason: string) {
    if (!NAMES.includes(name as CommercePolicyName) || !settings || typeof settings !== 'object' || Array.isArray(settings)) throw HttpError.badRequest('Invalid policy.');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || !reason.trim() || reason.length > 1000) throw HttpError.badRequest('A current version and approval reason are required.');
    const value = settings as Record<string, unknown>;
    if (name === 'reservation' && (value.priceBasis !== 'net_merchandise' || value.dayCutoff !== 'elapsed_24h' || value.extensionMode !== 'additive')) throw HttpError.badRequest('Approve the explicit reservation price, day cutoff and extension rules.');
    if (name === 'pawn') {
      try { validatePawnPolicy(value); }
      catch (error) { throw HttpError.badRequest((error as Error).message); }
    }
    if (name === 'loyalty' && (value.rewardTable !== 'source_shared_v1' || !['v6.2', 'one_primary', 'marketplace_v1'].includes(String(value.stacking)) || value.refundRounding !== 'cumulative_net' || value.lifetimeRefund !== 'reverse_earned' || !Number.isInteger(value.voucherExpiryDays) || Number(value.voucherExpiryDays) < 1 || !Number.isInteger(value.returnControlDays) || Number(value.returnControlDays) < 0 || Number(value.returnControlDays) > RETURN_WINDOW_DAYS)) throw HttpError.badRequest(`Approve rewards, stacking, refund behavior, voucher expiry and a return-control period of 0–${RETURN_WINDOW_DAYS} days explicitly.`);
    if (name === 'marketplace' && (!Number.isInteger(value.commissionBasisPoints) || Number(value.commissionBasisPoints) < 0 || Number(value.commissionBasisPoints) > 2000 || value.guaranteeBasisPoints !== 1000 || !['ceil','floor','nearest'].includes(String(value.guaranteeRounding)) || !Number.isInteger(value.settlementDelayDays) || Number(value.settlementDelayDays) < 0 || value.shippingAllocation !== 'per_seller_quote')) throw HttpError.badRequest('Approve commission, guarantee, settlement delay and seller shipping allocation explicitly.');
    if (name === 'voucher') {
      try { parseVoucherPolicy(value); }
      catch (error) { throw HttpError.badRequest((error as Error).message); }
    }
    if (name === 'buyback' && value.inboundCod !== 'not_supported') throw HttpError.badRequest('Inbound COD remains unsupported until an inspection-compatible policy is approved.');
    return DatabaseProvider.getInstance().transaction(async transaction => {
      const actor = await UserModel.findByPk(actorUserId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
      // Serialize policy approvals across admins, including the first version with no existing row.
      await DatabaseProvider.getInstance().query('SELECT pg_advisory_xact_lock(836204)', { transaction });
      const current = await CommercePolicyModel.findOne({ where: { name }, order: [['version', 'DESC']], transaction });
      if ((current?.version || 0) !== expectedVersion) throw HttpError.conflict('The policy changed. Review the latest version.');
      return CommercePolicyModel.create({ name, version: expectedVersion + 1, settings: value, approvedByUserId: actorUserId, reason: reason.trim() }, { transaction });
    });
  }
}
