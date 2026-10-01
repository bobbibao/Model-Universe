import MarketingOutcomeModel from '../../database/client/models/MarketingOutcome.Model';
import { AgentApiError } from '../../../../shared/server/utils/AgentApiUtils';
import { CAPABILITIES } from '../AgentSettingDefinitions';
import MailService from '../MailService';
import MarketService from '../MarketService';
import MetricsSyncService from '../marketing/MetricsSyncService';
import { BodyReader } from './AgentLimits';
import type { Applied, WriteContext } from './AgentWrites';

// Ingestion writes (data only: no grant, not revertible): market observations, the metrics sync, measured outcomes
// and notices for the admins.

type Raw = Record<string, unknown>;

const read = <T>(raw: Raw, fields: (reader: BodyReader) => T): T => {
  const reader = new BodyReader(raw);
  const body = fields(reader);
  const unknown = reader.unknown();
  if (unknown.length > 0) reader.errors.push(`unknown field(s): ${unknown.join(', ')}`);
  if (reader.errors.length > 0) {
    throw new AgentApiError('invalid_request', 'Invalid request body', { details: reader.errors });
  }
  return body;
};

const required = <T>(value: T | undefined, name: string, reader: BodyReader): T => {
  if (value === undefined && !reader.errors.some((e) => e.startsWith(name))) reader.errors.push(`${name} is required`);
  return value as T;
};

export const recordMarketObservations = async ({ body, transaction }: WriteContext<Raw>): Promise<Applied> => ({
  detail: await new MarketService().recordObservations(body, transaction),
  undo: null,
});

export const syncMetrics = async ({ body, transaction, now, dryRun }: WriteContext<Raw>): Promise<Applied> => {
  const { lookback } = read(body, (r) => ({
    lookback: r.number('lookback_days', { min: 1, max: 7, integer: true }) ?? 2,
  }));
  return { detail: await new MetricsSyncService().sync(lookback, transaction, now, dryRun), undo: null };
};

export const recordOutcome = async ({ body, transaction }: WriteContext<Raw>): Promise<Applied> => {
  const outcome = read(body, (r) => ({
    threadId: r.string('thread_id', { required: true, max: 64 }) as string,
    campaignRef: r.string('campaign_ref', { max: 64 }) ?? null,
    capability: r.oneOf('capability', CAPABILITIES, { required: true }) as string,
    verdict: r.oneOf('verdict', ['positive', 'negative', 'inconclusive'] as const, { required: true }) as
      'positive' | 'negative' | 'inconclusive',
    incrementalRevenueVnd: r.number('incremental_revenue_vnd', { integer: true }) ?? 0,
    incrementalProfitVnd: r.number('incremental_profit_vnd', { integer: true }) ?? 0,
    spendVnd: r.number('spend_vnd', { min: 0, integer: true }) ?? 0,
    confidence: r.number('confidence', { min: 0, max: 1 }) ?? null,
    measuredAt: required(r.dateTime('measured_at'), 'measured_at', r),
    details: r.object('details') ?? null,
  }));
  await MarketingOutcomeModel.create(outcome, { transaction });
  return { detail: `outcome ${outcome.verdict} for ${outcome.threadId} (${outcome.capability})`, undo: null };
};

export const notifyAdmins = async ({ body, transaction, now, dryRun }: WriteContext<Raw>): Promise<Applied> => {
  const notice = read(body, (r) => ({
    subject: r.string('subject', { required: true, max: 200 }) as string,
    message: r.string('message', { required: true, max: 5000 }) as string,
    severity: r.oneOf('severity', ['info', 'warning', 'critical'] as const) ?? 'info',
    dedupeKey: r.string('dedupe_key', { max: 128 }) ?? null,
  }));
  if (dryRun) return { detail: `dry run: would notify the admins: ${notice.subject}`, undo: null };
  return { detail: await new MailService().sendNotification(notice, transaction, now), undo: null };
};
