import OrderRefundModel from '../client/models/OrderRefund.Model';
import PartnerProfileModel from '../client/models/PartnerProfile.Model';
import PartnerEventModel from '../client/models/PartnerEvent.Model';
import PartnerMediaModel from '../client/models/PartnerMedia.Model';
import PartnerListingEventModel from '../client/models/PartnerListingEvent.Model';
import PartnerGuaranteeModel from '../client/models/PartnerGuarantee.Model';
import PartnerGuaranteePaymentModel from '../client/models/PartnerGuaranteePayment.Model';
import CustomerAddressModel from '../client/models/CustomerAddress.Model';
import RestockSubscriptionModel from '../client/models/RestockSubscription.Model';
import BuybackRequestModel from '../client/models/BuybackRequest.Model';
import BuybackEventModel from '../client/models/BuybackEvent.Model';
import BuybackPayoutModel from '../client/models/BuybackPayout.Model';
import PawnContractModel from '../client/models/PawnContract.Model';
import PawnEventModel from '../client/models/PawnEvent.Model';
import PawnPaymentModel from '../client/models/PawnPayment.Model';
import OrderReceiptModel from '../client/models/OrderReceipt.Model';
import ReturnRequestModel from '../client/models/ReturnRequest.Model';
import ReturnEventModel from '../client/models/ReturnEvent.Model';
import LoyaltyLedgerModel from '../client/models/LoyaltyLedger.Model';
import LoyaltyClaimModel from '../client/models/LoyaltyClaim.Model';
import LoyaltyGiftModel from '../client/models/LoyaltyGift.Model';
import LoyaltyRedemptionModel from '../client/models/LoyaltyRedemption.Model';
import EvidenceModel from '../client/models/Evidence.Model';
import CommerceNotificationModel from '../client/models/CommerceNotification.Model';
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
import AdminMarketingModel from '../client/models/AdminMarketing.Model';
import MarketCompetitorModel from '../client/models/MarketCompetitor.Model';
import MarketCompetitorPriceModel from '../client/models/MarketCompetitorPrice.Model';
import MarketCompetitorCampaignModel from '../client/models/MarketCompetitorCampaign.Model';
import MarketTrendPointModel from '../client/models/MarketTrendPoint.Model';
import MarketEventModel from '../client/models/MarketEvent.Model';
import MarketSourceModel from '../client/models/MarketSource.Model';
import AgentActionModel from '../client/models/AgentAction.Model';
import ConversionEventModel from '../client/models/ConversionEvent.Model';
import AdminNotificationModel from '../client/models/AdminNotification.Model';
import AgentApprovalModel from '../client/models/AgentApproval.Model';
import { ensureAgentSettingDefaults } from '../client/seeders/AgentSetting.Seeder';
import { ensureMarketEvents } from '../client/seeders/Market.Seeder';
import ProductModel from '../client/models/Product.Model';
import ReservationModel from '../client/models/Reservation.Model';
import ReservationPaymentModel from '../client/models/ReservationPayment.Model';
import ReservationEventModel from '../client/models/ReservationEvent.Model';
import CommercePolicyModel from '../client/models/CommercePolicy.Model';
import OrderItemModel from '../client/models/OrderItem.Model';

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
  {
    name: '2026-10-02-01-agent-approval',
    up: async () => {
      await ensureTables(AgentApprovalModel);
    },
  },
  {
    name: '2026-10-07-01-admin-marketing-drafts',
    up: async () => {
      await ensureTables(AdminMarketingModel);
    },
  },
  {
    name: '2026-10-08-01-gunpla-catalog',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), ProductModel, [
        'grade',
        'scale',
        'series',
        'modelCode',
        'condition',
        'assemblyState',
        'boxCondition',
        'includedAccessories',
        'defects',
        'descriptionEn',
        'descriptionVi',
      ]);
    },
  },
  {
    name: '2026-10-08-02-reservations',
    up: async () => {
      await ensureTables(ReservationModel, ReservationPaymentModel, ReservationEventModel);
    },
  },
  {
    name: '2026-10-08-03-policy-and-condition-snapshots',
    up: async ({ context }) => {
      await ensureTables(CommercePolicyModel);
      const queryInterface = context.sequelize.getQueryInterface();
      await ensureColumns(queryInterface, OrderModel, ['prepaidVnd', 'paymentSource']);
      await ensureColumns(queryInterface, OrderItemModel, ['modelSnapshot']);
      await ensureColumns(queryInterface, ReservationModel, ['policyVersion', 'modelSnapshot']);
    },
  },
  {
    name: '2026-10-08-04-private-evidence-and-reminders',
    up: async () => {
      await ensureTables(EvidenceModel, CommerceNotificationModel);
    },
  },
  {
    name: '2026-10-08-05-reservation-ledger-integrity',
    up: async ({ context }) => {
      await context.sequelize.query(
        `CREATE OR REPLACE FUNCTION commerce_reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Commerce ledger entries are append-only'; END $$`,
      );
      for (const table of ['reservation_payment', 'reservation_event', 'commerce_policy']) {
        await context.sequelize.query(
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${table}_immutable') THEN CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`,
        );
      }
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_amounts_valid') THEN ALTER TABLE reservation ADD CONSTRAINT reservation_amounts_valid CHECK (quantity > 0 AND "unitPriceVnd" > 0 AND "totalVnd" > 0 AND "paidVnd" >= 0 AND "paidVnd" <= "totalVnd" AND "extensionDays" >= 0); END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_payment_valid') THEN ALTER TABLE reservation_payment ADD CONSTRAINT reservation_payment_valid CHECK ("amountVnd" > 0 AND kind IN ('receipt','refund','forfeit')); END IF; END $$`,
      );
    },
  },
  {
    name: '2026-10-08-06-checkout-idempotency',
    up: async ({ context }) => {
      const query = context.sequelize.getQueryInterface();
      await ensureColumns(query, OrderModel, ['checkoutKey', 'checkoutDigest']);
      await context.sequelize.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS order_user_checkout_key ON "order" ("userId", "checkoutKey")',
      );
    },
  },
  {
    name: '2026-10-08-07-loyalty-ledger-and-owned-rewards',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), CouponModel, [
        'ownerUserId',
        'fixedAmountVnd',
        'maxDiscountVnd',
        'reservedOrderId',
        'usedAt',
        'policySnapshot',
      ]);
      await ensureTables(LoyaltyLedgerModel, LoyaltyClaimModel, LoyaltyGiftModel, LoyaltyRedemptionModel);
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'loyalty_ledger_immutable') THEN CREATE TRIGGER loyalty_ledger_immutable BEFORE UPDATE OR DELETE ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`,
      );
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_redemption_cost_valid') THEN ALTER TABLE loyalty_redemption ADD CONSTRAINT loyalty_redemption_cost_valid CHECK ("pointsCost" > 0); END IF; END $$`,
      );
    },
  },
  {
    name: '2026-10-08-08-verified-order-refunds',
    up: async ({ context }) => {
      await ensureTables(OrderRefundModel);
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'order_refund_immutable') THEN CREATE TRIGGER order_refund_immutable BEFORE UPDATE OR DELETE ON order_refund FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`,
      );
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_refund_valid') THEN ALTER TABLE order_refund ADD CONSTRAINT order_refund_valid CHECK ("merchandiseVnd" >= 0 AND "shippingVnd" >= 0 AND "taxVnd" >= 0 AND "merchandiseVnd"+"shippingVnd"+"taxVnd" > 0); END IF; END $$`,
      );
    },
  },
  {
    name: '2026-10-08-09-order-benefit-snapshot',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), OrderModel, ['benefitSnapshot']);
    },
  },
  {
    name: '2026-10-08-10-issued-reward-integrity',
    up: async ({ context }) => {
      await context.sequelize.query(
        `CREATE OR REPLACE FUNCTION commerce_protect_reward_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.source = 'loyalty' THEN IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued member rewards cannot be deleted'; END IF; IF ROW(NEW.code,NEW."ownerUserId",NEW."discountPercent",NEW."fixedAmountVnd",NEW."maxDiscountVnd",NEW."minOrderVnd",NEW."startDate",NEW."expirationDate",NEW."usageLimit",NEW."policySnapshot",NEW.source,NEW."isActive") IS DISTINCT FROM ROW(OLD.code,OLD."ownerUserId",OLD."discountPercent",OLD."fixedAmountVnd",OLD."maxDiscountVnd",OLD."minOrderVnd",OLD."startDate",OLD."expirationDate",OLD."usageLimit",OLD."policySnapshot",OLD.source,OLD."isActive") THEN RAISE EXCEPTION 'Issued member reward terms are immutable'; END IF; END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$`,
      );
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'coupon_reward_terms_immutable') THEN CREATE TRIGGER coupon_reward_terms_immutable BEFORE UPDATE OR DELETE ON coupon FOR EACH ROW EXECUTE FUNCTION commerce_protect_reward_terms(); END IF; END $$`,
      );
    },
  },
  {
    name: '2026-10-08-11-gift-configuration-audit',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), LoyaltyGiftModel, [
        'createdByUserId',
        'policyVersion',
      ]);
    },
  },
  {
    name: '2026-10-08-12-commerce-history-references',
    up: async ({ context }) => {
      // Add real database constraints to existing tables. Validation fails visibly on orphaned history;
      // migration never repairs it by deleting rows or guessing owners.
      const references: [string, string, string][] = [
        ['reservation', 'userId', 'user'],
        ['reservation', 'productId', 'product'],
        ['reservation', 'orderId', 'order'],
        ['reservation_payment', 'reservationId', 'reservation'],
        ['reservation_payment', 'confirmedByUserId', 'user'],
        ['reservation_event', 'reservationId', 'reservation'],
        ['reservation_event', 'actorUserId', 'user'],
        ['commerce_policy', 'approvedByUserId', 'user'],
        ['commerce_evidence', 'ownerUserId', 'user'],
        ['commerce_notification', 'userId', 'user'],
        ['loyalty_ledger', 'userId', 'user'],
        ['loyalty_ledger', 'actorUserId', 'user'],
        ['loyalty_claim', 'userId', 'user'],
        ['loyalty_claim', 'reviewedByUserId', 'user'],
        ['loyalty_gift', 'productId', 'product'],
        ['loyalty_gift', 'createdByUserId', 'user'],
        ['loyalty_redemption', 'userId', 'user'],
        ['loyalty_redemption', 'couponId', 'coupon'],
        ['loyalty_redemption', 'giftProductId', 'product'],
        ['loyalty_redemption', 'fulfilledByUserId', 'user'],
        ['order_refund', 'orderId', 'order'],
        ['order_refund', 'actorUserId', 'user'],
        ['coupon', 'ownerUserId', 'user'],
        ['coupon', 'reservedOrderId', 'order'],
      ];
      for (const [table, column, parent] of references) {
        const constraint = `${table}_${column}_history_fk`;
        await context.sequelize.query(
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}' AND conrelid = '"${table}"'::regclass) THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON UPDATE RESTRICT ON DELETE RESTRICT; END IF; END $$`,
        );
      }
    },
  },
  {
    name: '2026-10-08-13-verified-cod-collection',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), OrderModel, ['requiresCollectionConfirmation']);
      await ensureTables(OrderReceiptModel);
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'order_receipt_immutable') THEN CREATE TRIGGER order_receipt_immutable BEFORE UPDATE OR DELETE ON order_receipt FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_receipt_amount_valid') THEN ALTER TABLE order_receipt ADD CONSTRAINT order_receipt_amount_valid CHECK ("amountVnd" > 0); END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_receipt_order_history_fk') THEN ALTER TABLE order_receipt ADD CONSTRAINT order_receipt_order_history_fk FOREIGN KEY ("orderId") REFERENCES "order"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_receipt_actor_history_fk') THEN ALTER TABLE order_receipt ADD CONSTRAINT order_receipt_actor_history_fk FOREIGN KEY ("confirmedByUserId") REFERENCES "user"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`,
      );
    },
  },
  {
    name: '2026-10-08-14-model-return-reasons',
    up: async ({ context }) => {
      for (const reason of ['wrong_item', 'missing_accessories', 'undisclosed_defect', 'shipping_damage']) {
        await context.sequelize.query(`ALTER TYPE "enum_return_item_reason" ADD VALUE IF NOT EXISTS '${reason}'`);
      }
    },
  },
  {
    name: '2026-10-08-15-agreed-support-resolutions',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), ReturnRequestModel, [
        'resolutionVersion',
        'resolutionStatus',
        'resolutionTerms',
        'resolutionInventoryAllocated',
      ]);
      await ensureTables(ReturnEventModel);
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='return_event_immutable') THEN CREATE TRIGGER return_event_immutable BEFORE UPDATE OR DELETE ON return_event FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='return_event_request_history_fk') THEN ALTER TABLE return_event ADD CONSTRAINT return_event_request_history_fk FOREIGN KEY ("returnRequestId") REFERENCES return_request(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='return_event_actor_history_fk') THEN ALTER TABLE return_event ADD CONSTRAINT return_event_actor_history_fk FOREIGN KEY ("actorUserId") REFERENCES "user"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`,
      );
    },
  },
  {
    name: '2026-10-08-16-support-replacement-history',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), ReturnEventModel, ['productId']);
      await context.sequelize.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='return_event_product_history_fk') THEN ALTER TABLE return_event ADD CONSTRAINT return_event_product_history_fk FOREIGN KEY ("productId") REFERENCES product(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`,
      );
    },
  },
  {
    name: '2026-10-08-17-buyback-custody-payout-intake',
    up: async ({ context }) => {
      await ensureTables(BuybackRequestModel, BuybackEventModel, BuybackPayoutModel);
      for (const [table, column, parent] of [
        ['buyback_request', 'userId', 'user'], ['buyback_request', 'productId', 'product'],
        ['buyback_event', 'buybackRequestId', 'buyback_request'], ['buyback_event', 'actorUserId', 'user'],
        ['buyback_payout', 'buybackRequestId', 'buyback_request'], ['buyback_payout', 'actorUserId', 'user'],
      ]) {
        const constraint = `${table}_${column}_history_fk`;
        await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${constraint}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`);
      }
      for (const table of ['buyback_event', 'buyback_payout']) {
        await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='${table}_immutable') THEN CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`);
      }
      await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='buyback_payout_amount_valid') THEN ALTER TABLE buyback_payout ADD CONSTRAINT buyback_payout_amount_valid CHECK ("amountVnd" > 0); END IF; END $$`);
    },
  },
  {
    name: '2026-10-08-18-pawn-custody-and-money',
    up: async ({ context }) => {
      await ensureTables(PawnContractModel, PawnEventModel, PawnPaymentModel);
      for (const [table, column, parent] of [
        ['pawn_contract', 'userId', 'user'], ['pawn_contract', 'productId', 'product'],
        ['pawn_event', 'pawnContractId', 'pawn_contract'], ['pawn_event', 'actorUserId', 'user'],
        ['pawn_payment', 'pawnContractId', 'pawn_contract'], ['pawn_payment', 'actorUserId', 'user'],
      ]) {
        const constraint = `${table}_${column}_history_fk`;
        await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${constraint}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`);
      }
      for (const table of ['pawn_event', 'pawn_payment']) await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='${table}_immutable') THEN CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`);
      await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pawn_payment_amount_valid') THEN ALTER TABLE pawn_payment ADD CONSTRAINT pawn_payment_amount_valid CHECK ("amountVnd" > 0 AND "principalVnd" >= 0 AND "interestVnd" >= 0 AND "amountVnd"="principalVnd"+"interestVnd" AND kind IN ('disbursement','redemption')); END IF; END $$`);
      for (const table of ['reservation_payment', 'order_receipt', 'order_refund', 'buyback_payout', 'pawn_payment']) await context.sequelize.query(`CREATE INDEX IF NOT EXISTS ${table}_bank_reference_lookup ON ${table} (UPPER("externalReference"))`);
    },
  },
  {
    name: '2026-10-08-19-archive-mismatched-demo-media',
    up: async ({ context }) => {
      // Keep prior merchandise, images and order snapshots intact; this verified mismatch must not remain for sale.
      await context.sequelize.query(`UPDATE product SET "isArchived"=TRUE WHERE sku='MU-UNICORN-CUSTOM' AND "imageUrl"='/images/catalog/gundam-unicorn.webp'`);
    },
  },
  {
    name: '2026-10-08-20-archive-legacy-apparel-catalog',
    up: async ({ context }) => {
      // The original catalog used this apparel CDN. Retain every row and historical snapshot.
      await context.sequelize.query(`UPDATE product SET "isArchived"=TRUE, "isFeatured"=FALSE WHERE "imageUrl" LIKE 'https://images.asos-media.com/%'`);
    },
  },
  {
    name: '2026-10-08-21-private-partner-verification',
    up: async ({ context }) => {
      await ensureTables(PartnerProfileModel, PartnerEventModel);
      for (const [table,column,parent] of [
        ['partner_profile','userId','user'], ['partner_event','partnerId','partner_profile'], ['partner_event','actorUserId','user'],
      ]) {
        const constraint = `${table}_${column}_history_fk`;
        await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${constraint}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`);
      }
      await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='partner_event_immutable') THEN CREATE TRIGGER partner_event_immutable BEFORE UPDATE OR DELETE ON partner_event FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`);
    },
  },
  {
    name: '2026-10-08-22-partner-catalog-ownership',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), ProductModel, ['partnerId','listingStatus','listingVersion']);
      await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_partnerId_history_fk') THEN ALTER TABLE product ADD CONSTRAINT "product_partnerId_history_fk" FOREIGN KEY ("partnerId") REFERENCES partner_profile(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`);
    },
  },
  {
    name: '2026-10-08-23-partner-listing-moderation',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), ProductModel, ['listingRequestKey','listingRequestDigest','dispatchDays']);
      await ensureTables(PartnerMediaModel, PartnerListingEventModel);
      await context.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS product_partner_request_unique ON product ("partnerId","listingRequestKey") WHERE "partnerId" IS NOT NULL`);
      for (const [table,column,parent] of [
        ['partner_media','ownerUserId','user'],['partner_listing_event','productId','product'],
        ['partner_listing_event','partnerId','partner_profile'],['partner_listing_event','actorUserId','user'],
      ]) {
        const constraint = `${table}_${column}_history_fk`;
        await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${constraint}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`);
      }
      for (const table of ['partner_media','partner_listing_event']) await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='${table}_immutable') THEN CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`);
    },
  },
  {
    name: '2026-10-08-24-partner-guarantee-ledger',
    up: async ({ context }) => {
      await ensureTables(PartnerGuaranteeModel, PartnerGuaranteePaymentModel);
      for (const [table, column, parent] of [
        ['partner_guarantee','productId','product'],['partner_guarantee','partnerId','partner_profile'],['partner_guarantee','actorUserId','user'],
        ['partner_guarantee_payment','guaranteeId','partner_guarantee'],['partner_guarantee_payment','actorUserId','user'],
      ]) {
        const constraint = table+'_'+column+'_history_fk';
        await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${constraint}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`);
      }
      for (const table of ['partner_guarantee','partner_guarantee_payment']) await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='${table}_immutable') THEN CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION commerce_reject_ledger_mutation(); END IF; END $$`);
      await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='partner_guarantee_amount_valid') THEN ALTER TABLE partner_guarantee ADD CONSTRAINT partner_guarantee_amount_valid CHECK ("productValueVnd">0 AND "requiredVnd">0 AND "listingVersion">0); END IF; END $$`);
      await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='partner_guarantee_payment_amount_valid') THEN ALTER TABLE partner_guarantee_payment ADD CONSTRAINT partner_guarantee_payment_amount_valid CHECK ("amountVnd">0 AND kind IN ('receipt','refund')); END IF; END $$`);
      await context.sequelize.query(`CREATE INDEX IF NOT EXISTS partner_guarantee_payment_bank_reference_lookup ON partner_guarantee_payment (UPPER("externalReference"))`);
    },
  },
  {
    name: '2026-10-09-25-partner-bank-review',
    up: async ({ context }) => {
      await ensureColumns(context.sequelize.getQueryInterface(), PartnerProfileModel, ['pendingBankChange']);
    },
  },
  {
    name: '2026-10-09-26-customer-discovery-tools',
    up: async ({ context }) => {
      await ensureTables(CustomerAddressModel, RestockSubscriptionModel);
      for (const [table, column, parent] of [
        ['customer_address', 'userId', 'user'], ['restock_subscription', 'userId', 'user'], ['restock_subscription', 'productId', 'product'],
      ]) {
        const constraint = `${table}_${column}_history_fk`;
        await context.sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${constraint}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON DELETE RESTRICT ON UPDATE RESTRICT; END IF; END $$`);
      }
    },
  },
];
