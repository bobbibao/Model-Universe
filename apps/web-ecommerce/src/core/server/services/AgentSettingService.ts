import { QueryTypes, Transaction } from 'sequelize';
import AgentSettingModel from '../database/client/models/AgentSetting.Model';
import AgentSettingAuditModel from '../database/client/models/AgentSettingAudit.Model';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';
import { toSnakeCaseKeys } from '../../../shared/server/utils/CaseUtils';
import { rampProblems } from './agent/AutonomyRamp';
import {
  AGENT_SETTING_DEFAULTS,
  AGENT_SETTING_KEYS,
  AgentSettingKey,
  AgentSettings,
  isAgentSettingKey,
  validateAgentSetting,
} from './AgentSettingDefinitions';

export interface SettingEntry<K extends AgentSettingKey = AgentSettingKey> {
  key: K;
  value: AgentSettings[K];
  version: number;
  updatedAt: Date | null;
}

// This month's targets as the agent sees them (analytics.growth_targets): the owner's values or the automatic ones.
export interface GrowthTargets {
  month: string;
  trailing_monthly_revenue_vnd: number | null;
  revenue_target_vnd: number | null;
  revenue_target_source: 'owner' | 'auto_last_year' | 'auto_trailing_3m' | 'none';
  monthly_ad_cap_vnd: number;
  monthly_ad_cap_source: 'owner' | 'auto' | 'none';
}

const AUDIT_PAGE = 20;
const MAX_REASON_LENGTH = 500;

const toNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// The agent's business controls (/admin/agent/settings): read with their versions, change one key at a time with
// optimistic concurrency (the version the admin saw), every change audited.
export default class AgentSettingService {
  // Every setting, as a list (the keys contain dots, so they stay values rather than JSON object keys).
  async getAll(transaction?: Transaction): Promise<SettingEntry[]> {
    const rows = await AgentSettingModel.findAll({ transaction });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return AGENT_SETTING_KEYS.map((key) => {
      const row = byKey.get(key);
      return row
        ? { key, value: row.value, version: row.version, updatedAt: row.updatedAt }
        : { key, value: AGENT_SETTING_DEFAULTS[key], version: 0, updatedAt: null };
    }) as SettingEntry[];
  }

  async get<K extends AgentSettingKey>(key: K): Promise<AgentSettings[K]> {
    const row = await AgentSettingModel.findByPk(key);
    return (row ? row.value : AGENT_SETTING_DEFAULTS[key]) as AgentSettings[K];
  }

  async getTargets(transaction?: Transaction): Promise<GrowthTargets | null> {
    const [row] = await DatabaseProvider.getInstance().query<Record<string, unknown>>(
      'SELECT * FROM analytics.growth_targets',
      { type: QueryTypes.SELECT, transaction },
    );
    if (!row) return null;
    return {
      month: String(row.month),
      trailing_monthly_revenue_vnd: toNumber(row.trailing_monthly_revenue_vnd),
      revenue_target_vnd: toNumber(row.revenue_target_vnd),
      revenue_target_source: row.revenue_target_source as GrowthTargets['revenue_target_source'],
      monthly_ad_cap_vnd: Number(row.monthly_ad_cap_vnd ?? 0),
      monthly_ad_cap_source: row.monthly_ad_cap_source as GrowthTargets['monthly_ad_cap_source'],
    };
  }

  async listAudit(limit = AUDIT_PAGE): Promise<AgentSettingAuditModel[]> {
    return AgentSettingAuditModel.findAll({ order: [['id', 'DESC']], limit });
  }

  // Sets one key. `version` must be the version the admin edited (0 for a key never saved), else 409. The value
  // arrives in the client's camelCase and is stored snake_case (the agent's format). Autonomy follows the ramp
  // (agent/AutonomyRamp): the brand gate always holds; eligibility can be overridden with `force` and a reason.
  async update(rawKey: string, data: Record<string, unknown>, userId: number): Promise<SettingEntry> {
    if (!isAgentSettingKey(rawKey)) throw HttpError.notFound('Không tìm thấy cài đặt.');
    const key: AgentSettingKey = rawKey;
    const { value, errors } = validateAgentSetting(key, toSnakeCaseKeys(data.value));
    const expectedVersion = toInteger(data.version);
    if (expectedVersion === undefined || expectedVersion < 0) errors.push('Thiếu phiên bản của cài đặt.');
    const reason = asTrimmedString(data.reason);
    if (reason.length > MAX_REASON_LENGTH) errors.push(`Lý do tối đa ${MAX_REASON_LENGTH} ký tự.`);
    const force = data.force === true;
    if (force && !reason) errors.push('Cần ghi lý do khi bỏ qua điều kiện nâng quyền tự động.');
    if (errors.length > 0) throw HttpError.badRequest('Cài đặt chưa hợp lệ.', errors);

    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      const row = await AgentSettingModel.findByPk(key, { transaction, lock: transaction.LOCK.UPDATE });
      const currentVersion = row?.version ?? 0;
      if (currentVersion !== expectedVersion) {
        throw HttpError.conflict('Cài đặt vừa được người khác thay đổi, vui lòng tải lại trang.');
      }
      const oldValue = row ? row.value : AGENT_SETTING_DEFAULTS[key];
      if (key === 'autonomy') {
        const brand = await AgentSettingModel.findByPk('brand.approved', { transaction });
        const brandApproved = (brand ? brand.value : AGENT_SETTING_DEFAULTS['brand.approved']) === true;
        const ramp = await rampProblems(
          oldValue as AgentSettings['autonomy'],
          value as AgentSettings['autonomy'],
          brandApproved,
          new Date(),
          transaction,
        );
        const blocking = force ? ramp.brand : [...ramp.brand, ...ramp.eligibility];
        if (blocking.length > 0) throw HttpError.badRequest('Chưa đủ điều kiện thay đổi quyền tự động.', blocking);
      }
      const version = currentVersion + 1;
      const saved = row
        ? await row.update({ value, version, updatedBy: userId }, { transaction })
        : await AgentSettingModel.create({ key, value, version, updatedBy: userId }, { transaction });
      await AgentSettingAuditModel.create(
        {
          key,
          oldValue,
          newValue: value,
          version,
          changedBy: userId,
          reason: (force ? `[force] ${reason}` : reason) || null,
        },
        { transaction },
      );
      return { key, value: saved.value as AgentSettings[typeof key], version, updatedAt: saved.updatedAt };
    });
  }
}
