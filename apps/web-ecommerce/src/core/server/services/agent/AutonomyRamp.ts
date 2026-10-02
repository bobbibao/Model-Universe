import { Op, Transaction } from 'sequelize';
import AdCampaignModel from '../../database/client/models/AdCampaign.Model';
import AgentActionModel from '../../database/client/models/AgentAction.Model';
import AgentSettingModel from '../../database/client/models/AgentSetting.Model';
import AgentSettingAuditModel from '../../database/client/models/AgentSettingAudit.Model';
import MarketingOutcomeModel from '../../database/client/models/MarketingOutcome.Model';
import { AGENT_SETTING_DEFAULTS, CAPABILITIES, type AutonomyMode, type Capability } from '../AgentSettingDefinitions';
import { DAY_MS } from './AgentLimits';

// The autonomy ramp (docs/GROWTH_AGENT.md section 4). A growth capability may move to `auto_low` only with at least 10
// measured outcomes in 90 days, 60% of them non-negative and no incident in 30 days; the owner can force it with a
// written reason (audited). Brand gate: a growth capability never leaves `shadow` (or `off`) while the brand guide is
// not approved, forced or not. Demotion to `ask` is protective and automatic: after two negative outcomes in a row,
// or an incident (a protective action of the agent's in-flight guard, action id `guard-<rule>`).

export const RAMP = {
  minOutcomes: 10,
  outcomeDays: 90,
  minNonNegativeShare: 0.6,
  incidentDays: 30,
  negativesInARow: 2,
} as const;

export const GROWTH_CAPABILITIES: readonly Capability[] = [
  'promotion',
  'facebook_post',
  'ads_meta',
  'ads_google',
  'ads_tiktok',
];

type Modes = Record<Capability, AutonomyMode>;

export interface RampRecord {
  outcomes: number;
  nonNegative: number;
  incidents: number;
}

// The capability a guard incident acted on: an ad's platform, or promotions.
const incidentCapability = async (endpoint: string, transaction?: Transaction): Promise<Capability | null> => {
  if (endpoint.startsWith('promotions/')) return 'promotion';
  const ad = /^marketing\/ads\/([^/]+)\//.exec(endpoint);
  if (!ad) return null;
  const row = await AdCampaignModel.findOne({ where: { ref: ad[1] }, transaction });
  return row ? (`ads_${row.platform}` as Capability) : null;
};

export const rampRecord = async (capability: Capability, now: Date, transaction?: Transaction): Promise<RampRecord> => {
  const outcomes = await MarketingOutcomeModel.findAll({
    where: { capability, measuredAt: { [Op.gt]: new Date(now.getTime() - RAMP.outcomeDays * DAY_MS) } },
    transaction,
  });
  const guarded = await AgentActionModel.findAll({
    where: {
      writeClass: 'protective',
      actionId: { [Op.like]: 'guard-%' },
      createdAt: { [Op.gt]: new Date(now.getTime() - RAMP.incidentDays * DAY_MS) },
    },
    transaction,
  });
  let incidents = 0;
  for (const action of guarded)
    if ((await incidentCapability(action.endpoint, transaction)) === capability) incidents++;
  return {
    outcomes: outcomes.length,
    nonNegative: outcomes.filter((o) => o.verdict !== 'negative').length,
    incidents,
  };
};

const leavesShadow = (mode: AutonomyMode) => mode === 'ask' || mode === 'auto_low';

// Why this change of modes may not happen: `brand` problems can never be forced, `eligibility` ones can.
export const rampProblems = async (
  previous: Modes,
  next: Modes,
  brandApproved: boolean,
  now: Date,
  transaction?: Transaction,
): Promise<{ brand: string[]; eligibility: string[] }> => {
  const brand: string[] = [];
  const eligibility: string[] = [];
  for (const capability of CAPABILITIES) {
    if (next[capability] === previous[capability]) continue;
    if (!brandApproved && GROWTH_CAPABILITIES.includes(capability) && leavesShadow(next[capability])) {
      brand.push(`${capability}: hướng dẫn thương hiệu chưa được duyệt, chỉ có thể để off hoặc shadow.`);
    }
    // Eligibility is measured by marketing outcomes, which only growth capabilities have.
    if (next[capability] !== 'auto_low' || !GROWTH_CAPABILITIES.includes(capability)) continue;
    const record = await rampRecord(capability, now, transaction);
    if (record.outcomes < RAMP.minOutcomes) {
      eligibility.push(
        `${capability}: mới có ${record.outcomes} kết quả đo lường trong ${RAMP.outcomeDays} ngày (cần ${RAMP.minOutcomes}).`,
      );
    } else if (record.nonNegative / record.outcomes < RAMP.minNonNegativeShare) {
      eligibility.push(
        `${capability}: chỉ ${record.nonNegative}/${record.outcomes} kết quả không âm (cần ${RAMP.minNonNegativeShare * 100}%).`,
      );
    }
    if (record.incidents > 0) {
      eligibility.push(`${capability}: có ${record.incidents} sự cố trong ${RAMP.incidentDays} ngày qua.`);
    }
  }
  return { brand, eligibility };
};

// Protective: capabilities in `auto_low` go back to `ask`, audited with the reason (no user: the system decided).
export const demote = async (capabilities: Capability[], reason: string, transaction: Transaction) => {
  const row = await AgentSettingModel.findByPk('autonomy', { transaction, lock: transaction.LOCK.UPDATE });
  const modes = (row ? row.value : AGENT_SETTING_DEFAULTS.autonomy) as Modes;
  const demoted = capabilities.filter((c) => modes[c] === 'auto_low');
  if (demoted.length === 0) return [];
  const value = { ...modes, ...Object.fromEntries(demoted.map((c) => [c, 'ask'])) };
  const version = (row?.version ?? 0) + 1;
  if (row) await row.update({ value, version, updatedBy: null }, { transaction });
  else await AgentSettingModel.create({ key: 'autonomy', value, version, updatedBy: null }, { transaction });
  await AgentSettingAuditModel.create(
    { key: 'autonomy', oldValue: modes, newValue: value, version, changedBy: null, reason: `auto-demotion: ${reason}` },
    { transaction },
  );
  return demoted;
};

// After an outcome is recorded: two negative verdicts in a row for a capability demote it.
export const demoteAfterNegatives = async (capability: Capability, transaction: Transaction) => {
  const latest = await MarketingOutcomeModel.findAll({
    where: { capability },
    order: [
      ['measuredAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: RAMP.negativesInARow,
    transaction,
  });
  if (latest.length < RAMP.negativesInARow || latest.some((o) => o.verdict !== 'negative')) return [];
  return demote([capability], `${RAMP.negativesInARow} kết quả âm liên tiếp`, transaction);
};
