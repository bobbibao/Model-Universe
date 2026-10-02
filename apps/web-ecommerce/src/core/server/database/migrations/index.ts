import type { Sequelize } from 'sequelize-typescript';
import { ensureColumns, ensureTables } from './helpers';
import AgentSettingModel from '../client/models/AgentSetting.Model';
import AgentSettingAuditModel from '../client/models/AgentSettingAudit.Model';
import ConsentLogModel from '../client/models/ConsentLog.Model';
import OrderModel from '../client/models/Order.Model';
import CouponModel from '../client/models/Coupon.Model';
import ProductDiscountModel from '../client/models/ProductDiscount.Model';
import MarketingCampaignModel from '../client/models/MarketingCampaign.Model';
import MarketingPostModel from '../client/models/MarketingPost.Model';
import AdCampaignModel from '../client/models/AdCampaign.Model';
import AdMetricDailyModel from '../client/models/AdMetricDaily.Model';
import PostMetricDailyModel from '../client/models/PostMetricDaily.Model';
import MarketingBudgetPeriodModel from '../client/models/MarketingBudgetPeriod.Model';
import MarketingBudgetEntryModel from '../client/models/MarketingBudgetEntry.Model';
import MarketingOutcomeModel from '../client/models/MarketingOutcome.Model';
import MarketingAssetModel from '../client/models/MarketingAsset.Model';
import MarketCompetitorModel from '../client/models/MarketCompetitor.Model';
import MarketCompetitorPriceModel from '../client/models/MarketCompetitorPrice.Model';
import MarketCompetitorCampaignModel from '../client/models/MarketCompetitorCampaign.Model';
import MarketTrendPointModel from '../client/models/MarketTrendPoint.Model';
import MarketEventModel from '../client/models/MarketEvent.Model';
import MarketSourceModel from '../client/models/MarketSource.Model';
import AgentActionModel from '../client/models/AgentAction.Model';
import ConversionEventModel from '../client/models/ConversionEvent.Model';
import AdminNotificationModel from '../client/models/AdminNotification.Model';
import { ensureAgentSettingDefaults } from '../client/seeders/AgentSetting.Seeder';
import { ensureMarketEvents } from '../client/seeders/Market.Seeder';

export interface MigrationContext {
  sequelize: Sequelize;
}

export interface Migration {
  name: string;
  up: (params: { context: MigrationContext }) => Promise<void>;
}

// Applied in this order, each once per database (recorded in "SequelizeMeta"). Never edit or reorder an applied
// migration: add a new one.
export const MIGRATIONS: Migration[] = [
  {
    name: '2026-09-30-01-agent-settings',
    up: async () => {
      await ensureTables(AgentSettingModel, AgentSettingAuditModel);
      await ensureAgentSettingDefaults();
    },
  },
  {
    name: '2026-09-30-02-attribution-and-consent',
    up: async ({ context }) => {
      const queryInterface = context.sequelize.getQueryInterface();
      await ensureColumns(queryInterface, OrderModel, [
        'utmSource',
        'utmMedium',
        'utmCampaign',
        'utmContent',
        'utmTerm',
        'clickId',
        'clickIdType',
        'landingPath',
      ]);
      await ensureTables(ConsentLogModel);
    },
  },
  {
    name: '2026-09-30-03-promotion-columns',
    up: async ({ context }) => {
      const queryInterface = context.sequelize.getQueryInterface();
      await ensureColumns(queryInterface, CouponModel, ['minOrderVnd', 'source', 'agentActionId', 'campaignRef']);
      await ensureColumns(queryInterface, ProductDiscountModel, ['campaignRef']);
    },
  },
  {
    name: '2026-09-30-04-marketing-tables',
    up: async () => {
      await ensureTables(
        MarketingCampaignModel,
        MarketingPostModel,
        AdCampaignModel,
        AdMetricDailyModel,
        PostMetricDailyModel,
        MarketingBudgetPeriodModel,
        MarketingBudgetEntryModel,
        MarketingOutcomeModel,
        MarketingAssetModel,
      );
    },
  },
  {
    name: '2026-09-30-05-market-tables',
    up: async () => {
      await ensureTables(
        MarketCompetitorModel,
        MarketCompetitorPriceModel,
        MarketCompetitorCampaignModel,
        MarketTrendPointModel,
        MarketEventModel,
        MarketSourceModel,
      );
      await ensureMarketEvents();
    },
  },
  {
    name: '2026-10-01-06-agent-action-audit',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), AgentActionModel, [
        'threadId',
        'runId',
        'optionId',
        'actionId',
        'stepNo',
        'writeClass',
        'approvalMode',
        'approverUserId',
        'grantJti',
        'riskTier',
        'policyVersion',
        'modelProfile',
        'promptVersion',
        'traceId',
      ]);
    },
  },
  {
    name: '2026-10-01-07-marketing-details',
    up: async ({ context }) => {
      const queryInterface = context.sequelize.getQueryInterface();
      await ensureColumns(queryInterface, MarketingCampaignModel, ['name', 'channels']);
      await ensureColumns(queryInterface, AdCampaignModel, ['activatedAt', 'linkPath', 'creative', 'platformData']);
      await ensureTables(ConversionEventModel, AdminNotificationModel);
    },
  },
];
