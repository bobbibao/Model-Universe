import 'reflect-metadata';

import { Sequelize } from 'sequelize-typescript';

//import { Sequelize } from 'sequelize';
import { loadEnvConfig } from '@next/env';

import Logger from '../../../shared/server/utils/logger';
import ConfigModel from './internal/models/Config.Model';
import UserModel from './internal/models/User.Model';
import EmailVerificationModel from './internal/models/EmailVerification.Model';
import CategoryModel from './client/models/Category.Model';
import SupplierModel from './client/models/Supplier.Model';
import ProductModel from './client/models/Product.Model';
import ProductImageModel from './client/models/ProductImage.Model';
import ReviewModel from './client/models/Review.Model';
import WishlistItemModel from './client/models/WishlistItem.Model';
import CouponModel from './client/models/Coupon.Model';
import OrderModel from './client/models/Order.Model';
import OrderItemModel from './client/models/OrderItem.Model';
import StockImportModel from './client/models/StockImport.Model';
import StockImportItemModel from './client/models/StockImportItem.Model';
import ContactMessageModel from './client/models/ContactMessage.Model';
import ReturnRequestModel from './client/models/ReturnRequest.Model';
import ReturnEventModel from './client/models/ReturnEvent.Model';
import ReturnItemModel from './client/models/ReturnItem.Model';
import AgentActionModel from './client/models/AgentAction.Model';
import ProductDiscountModel from './client/models/ProductDiscount.Model';
import AgentTaskModel from './client/models/AgentTask.Model';
import SopChecklistItemModel from './client/models/SopChecklistItem.Model';
import AgentSettingModel from './client/models/AgentSetting.Model';
import AgentSettingAuditModel from './client/models/AgentSettingAudit.Model';
import ConsentLogModel from './client/models/ConsentLog.Model';
import MarketingCampaignModel from './client/models/MarketingCampaign.Model';
import MarketingPostModel from './client/models/MarketingPost.Model';
import AdCampaignModel from './client/models/AdCampaign.Model';
import AdMetricDailyModel from './client/models/AdMetricDaily.Model';
import PostMetricDailyModel from './client/models/PostMetricDaily.Model';
import MarketingBudgetPeriodModel from './client/models/MarketingBudgetPeriod.Model';
import MarketingBudgetEntryModel from './client/models/MarketingBudgetEntry.Model';
import MarketingOutcomeModel from './client/models/MarketingOutcome.Model';
import MarketingAssetModel from './client/models/MarketingAsset.Model';
import AdminMarketingModel from './client/models/AdminMarketing.Model';
import MarketCompetitorModel from './client/models/MarketCompetitor.Model';
import MarketCompetitorPriceModel from './client/models/MarketCompetitorPrice.Model';
import MarketCompetitorCampaignModel from './client/models/MarketCompetitorCampaign.Model';
import MarketTrendPointModel from './client/models/MarketTrendPoint.Model';
import MarketEventModel from './client/models/MarketEvent.Model';
import MarketSourceModel from './client/models/MarketSource.Model';
import ConversionEventModel from './client/models/ConversionEvent.Model';
import AdminNotificationModel from './client/models/AdminNotification.Model';
import AgentApprovalModel from './client/models/AgentApproval.Model';
import ReservationModel from './client/models/Reservation.Model';
import ReservationPaymentModel from './client/models/ReservationPayment.Model';
import ReservationEventModel from './client/models/ReservationEvent.Model';
import CommercePolicyModel from './client/models/CommercePolicy.Model';
import EvidenceModel from './client/models/Evidence.Model';
import CommerceNotificationModel from './client/models/CommerceNotification.Model';
import OrderRefundModel from './client/models/OrderRefund.Model';
import OrderReceiptModel from './client/models/OrderReceipt.Model';
import LoyaltyLedgerModel from './client/models/LoyaltyLedger.Model';
import LoyaltyClaimModel from './client/models/LoyaltyClaim.Model';
import LoyaltyGiftModel from './client/models/LoyaltyGift.Model';
import LoyaltyRedemptionModel from './client/models/LoyaltyRedemption.Model';
import BuybackRequestModel from './client/models/BuybackRequest.Model';
import BuybackEventModel from './client/models/BuybackEvent.Model';
import BuybackPayoutModel from './client/models/BuybackPayout.Model';
import PawnContractModel from './client/models/PawnContract.Model';
import PawnEventModel from './client/models/PawnEvent.Model';
import PawnPaymentModel from './client/models/PawnPayment.Model';
import PartnerProfileModel from './client/models/PartnerProfile.Model';
import PartnerEventModel from './client/models/PartnerEvent.Model';
import PartnerMediaModel from './client/models/PartnerMedia.Model';
import PartnerListingEventModel from './client/models/PartnerListingEvent.Model';
import PartnerGuaranteeModel from './client/models/PartnerGuarantee.Model';
import PartnerGuaranteePaymentModel from './client/models/PartnerGuaranteePayment.Model';
import { failIfStrict, seedData } from './client/seeders/Seeder';
import { beginSeeding } from './client/seeders/SeedClock';
import { applyAnalyticsViews } from './analytics/AnalyticsViews';
import { MIGRATION_TABLE, runMigrations } from './migrations/Migrator';

export default class DatabaseProvider {
  // Dependency order: referenced tables come before the tables that point to them.
  private static models: any = [
    UserModel,
    EmailVerificationModel,
    ConfigModel,
    CategoryModel,
    SupplierModel,
    ProductModel,
    ProductImageModel,
    ReviewModel,
    WishlistItemModel,
    // Before the tables that point at it (coupons, discounts, tasks, marketing rows the agent created).
    AgentActionModel,
    CouponModel,
    OrderModel,
    OrderItemModel,
    StockImportModel,
    StockImportItemModel,
    ContactMessageModel,
    // After orders and stock imports: the return seeder picks products without import history.
    ReturnRequestModel,
    ReturnItemModel,
    // Shop agent integration (Agent API writes from apps/agent-service)
    ProductDiscountModel,
    AgentTaskModel,
    SopChecklistItemModel,
    // Growth agent (plan phase 5): settings, consent, marketing, market data. Every column and table is declared on
    // its model; migrations/ adds them to existing databases.
    AgentSettingModel,
    AgentSettingAuditModel,
    ConsentLogModel,
    MarketingCampaignModel,
    MarketingPostModel,
    AdCampaignModel,
    AdMetricDailyModel,
    PostMetricDailyModel,
    MarketingBudgetPeriodModel,
    MarketingBudgetEntryModel,
    MarketingOutcomeModel,
    MarketingAssetModel,
    AdminMarketingModel,
    MarketCompetitorModel,
    MarketCompetitorPriceModel,
    MarketCompetitorCampaignModel,
    MarketTrendPointModel,
    MarketEventModel,
    MarketSourceModel,
    ConversionEventModel,
    AdminNotificationModel,
    AgentApprovalModel,
    ReservationModel,
    ReservationPaymentModel,
    ReservationEventModel,
    CommercePolicyModel,
    EvidenceModel,
    CommerceNotificationModel,
    OrderRefundModel,
    OrderReceiptModel,
    ReturnEventModel,
    BuybackRequestModel,
    BuybackEventModel,
    BuybackPayoutModel,
    PawnContractModel,
    PawnEventModel,
    PawnPaymentModel,
    PartnerProfileModel,
    PartnerEventModel,
    PartnerMediaModel,
    PartnerListingEventModel,
    PartnerGuaranteeModel,
    PartnerGuaranteePaymentModel,
    LoyaltyLedgerModel,
    LoyaltyClaimModel,
    LoyaltyGiftModel,
    LoyaltyRedemptionModel,

  ];

  private static modelsToSeedInProduction: any = [UserModel, CategoryModel];

  private static instance: Sequelize;

  private static createInstance(): any {
    let sequelize: any = undefined;
    loadEnvConfig('./', true);

    try {
      const dbHost = process.env.DB_HOST;
      const dbPort = parseInt(process.env.DB_PORT ?? '10');
      const dbUsername = process.env.DB_USERNAME;
      const dbPassword = process.env.DB_PASSWORD;
      const dbName = process.env.DB_NAME;
      const dbSchema = process.env.DB_SCHEMA ?? 'public';

      sequelize = new Sequelize(dbName || '', dbUsername || '', dbPassword || '', {
        host: dbHost || '',
        dialect: 'postgres',
        port: dbPort,
        database: 'public',
        define: {
          // Your model options (e.g., timestamps, underscored, etc.)
        },
        pool: {
          max: 5, // Maximum number of connections in the pool
          min: 0, // Minimum number of connections in the pool
          acquire: 30000, // The maximum time, in milliseconds, that pool will try to get connection before throwing an error
          idle: 10000, // The maximum time, in milliseconds, that a connection can be idle before being released
        },
        logging: false,
      });
    } catch (error) {
      Logger.ERROR(`Error connecting to database: ${error}`);
    }
    return sequelize;
  }

  private static async loadModels(sequelize: Sequelize) {
    // Development seed data (demo catalog, orders, returns): in development, or when a seed script asks for it
    // explicitly (SEED_PROFILE=development, e.g. `yarn seed-ci` for e2e) whatever NODE_ENV is.
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.SEED_PROFILE === 'development';

    if (!sequelize) {
      Logger.ERROR(`Sequelize is not initialized.`);
      return;
    }

    try {
      // Register every model and its associations first, so tables are created with their foreign keys.
      for (const model of DatabaseProvider.models) {
        Logger.INFO('Loading Model: ', model.name);
        if (typeof model.initializeModel === 'function') {
          model.initializeModel(sequelize); // Call the initializeModel method
        }
        sequelize.addModels([model]);
      }
      await DatabaseProvider.loadRelationships();

      // Models are listed in dependency order: create all missing tables first, then seed them in the same order
      // (a seeder may fill several tables, e.g. products with their images).
      const createdModels = [];
      if (process.env.SEED_DATA == 'true') beginSeeding(); // SEED_NOW and SEED_RANDOM_SEED for every seeder
      for (const model of process.env.SEED_DATA === 'true' ? DatabaseProvider.models : []) {
        const tableExistsResult = await DatabaseProvider.tableExists(model, sequelize);
        if (!tableExistsResult) {
          await model.sync();
          createdModels.push(model);
        }
      }
      for (const model of createdModels) {
        Logger.INFO('Seeding Model: ', model.name);
        if (isDevelopment) {
          // Only seed data in the development environment
          if (model.seedData) {
            await model.seedData();
          } else {
            await seedData(model.name);
          }
          Logger.INFO(`Data seeding ${model.name} completed.`);
        } else {
          // Only seed data in the staging/production environment for specific models
          if (DatabaseProvider.modelsToSeedInProduction.includes(model) && model.seedData) {
            await model.seedData();
          }
          Logger.INFO(`Data seeding ${model.name} completed.`);
        }
      }
    } catch (error) {
      Logger.ERROR(`Error loading Sequelize models: ${error}`);
      failIfStrict(error);
    }
  }

  private static async loadRelationships() {
    CategoryModel.hasMany(ProductModel, { foreignKey: 'categoryId', as: 'products' });
    ProductModel.belongsTo(CategoryModel, { foreignKey: 'categoryId', as: 'category' });

    SupplierModel.hasMany(ProductModel, { foreignKey: 'supplierId', as: 'products' });
    ProductModel.belongsTo(SupplierModel, { foreignKey: 'supplierId', as: 'supplier' });

    ProductModel.hasMany(ProductImageModel, { foreignKey: 'productId', as: 'images', onDelete: 'CASCADE' });
    ProductImageModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product' });

    ProductModel.hasMany(ReviewModel, { foreignKey: 'productId', as: 'reviews', onDelete: 'CASCADE' });
    ReviewModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product' });
    UserModel.hasMany(ReviewModel, { foreignKey: 'userId', as: 'reviews' });
    ReviewModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

    UserModel.hasMany(WishlistItemModel, { foreignKey: 'userId', as: 'wishlistItems', onDelete: 'CASCADE' });
    WishlistItemModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });
    ProductModel.hasMany(WishlistItemModel, { foreignKey: 'productId', as: 'wishlistItems', onDelete: 'CASCADE' });
    WishlistItemModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product' });

    // onDelete is repeated on belongsTo: its default (CASCADE for NOT NULL keys) would override the hasMany option.
    UserModel.hasMany(OrderModel, { foreignKey: 'userId', as: 'orders', onDelete: 'RESTRICT' });
    OrderModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user', onDelete: 'RESTRICT' });
    OrderModel.hasMany(OrderItemModel, { foreignKey: 'orderId', as: 'items', onDelete: 'CASCADE' });
    OrderItemModel.belongsTo(OrderModel, { foreignKey: 'orderId', as: 'order' });
    // Products that were ordered cannot be deleted (they are archived instead).
    ProductModel.hasMany(OrderItemModel, { foreignKey: 'productId', as: 'orderItems', onDelete: 'RESTRICT' });
    OrderItemModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product', onDelete: 'RESTRICT' });

    SupplierModel.hasMany(StockImportModel, { foreignKey: 'supplierId', as: 'stockImports', onDelete: 'RESTRICT' });
    StockImportModel.belongsTo(SupplierModel, { foreignKey: 'supplierId', as: 'supplier', onDelete: 'RESTRICT' });
    UserModel.hasMany(StockImportModel, { foreignKey: 'createdBy', as: 'stockImports', onDelete: 'RESTRICT' });
    StockImportModel.belongsTo(UserModel, { foreignKey: 'createdBy', as: 'creator', onDelete: 'RESTRICT' });
    StockImportModel.hasMany(StockImportItemModel, { foreignKey: 'stockImportId', as: 'items', onDelete: 'CASCADE' });
    StockImportItemModel.belongsTo(StockImportModel, { foreignKey: 'stockImportId', as: 'stockImport' });
    // Products with import history cannot be deleted (they are archived instead).
    ProductModel.hasMany(StockImportItemModel, {
      foreignKey: 'productId',
      as: 'stockImportItems',
      onDelete: 'RESTRICT',
    });
    StockImportItemModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product', onDelete: 'RESTRICT' });

    // Returns are history: an order or order line with returns cannot be deleted.
    OrderModel.hasMany(ReturnRequestModel, { foreignKey: 'orderId', as: 'returns', onDelete: 'RESTRICT' });
    ReturnRequestModel.belongsTo(OrderModel, { foreignKey: 'orderId', as: 'order', onDelete: 'RESTRICT' });
    UserModel.hasMany(ReturnRequestModel, { foreignKey: 'userId', as: 'returnRequests', onDelete: 'RESTRICT' });
    ReturnRequestModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user', onDelete: 'RESTRICT' });
    ReturnRequestModel.belongsTo(UserModel, { foreignKey: 'processedBy', as: 'processor', onDelete: 'RESTRICT' });
    ReturnRequestModel.hasMany(ReturnItemModel, { foreignKey: 'returnRequestId', as: 'items', onDelete: 'CASCADE' });
    ReturnItemModel.belongsTo(ReturnRequestModel, {
      foreignKey: 'returnRequestId',
      as: 'returnRequest',
      onDelete: 'CASCADE',
    });
    OrderItemModel.hasMany(ReturnItemModel, { foreignKey: 'orderItemId', as: 'returnItems', onDelete: 'RESTRICT' });
    ReturnItemModel.belongsTo(OrderItemModel, { foreignKey: 'orderItemId', as: 'orderItem', onDelete: 'RESTRICT' });

    ProductModel.hasMany(ProductDiscountModel, { foreignKey: 'productId', as: 'discounts', onDelete: 'CASCADE' });
    ProductDiscountModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product', onDelete: 'CASCADE' });
    // Agent actions are an append-only audit trail: rows that point at them keep the link.
    AgentActionModel.hasMany(ProductDiscountModel, {
      foreignKey: 'agentActionId',
      as: 'discounts',
      onDelete: 'RESTRICT',
    });
    ProductDiscountModel.belongsTo(AgentActionModel, {
      foreignKey: 'agentActionId',
      as: 'agentAction',
      onDelete: 'RESTRICT',
    });
    AgentActionModel.hasMany(AgentTaskModel, { foreignKey: 'agentActionId', as: 'tasks', onDelete: 'RESTRICT' });
    AgentTaskModel.belongsTo(AgentActionModel, {
      foreignKey: 'agentActionId',
      as: 'agentAction',
      onDelete: 'RESTRICT',
    });
    AgentActionModel.hasMany(SopChecklistItemModel, {
      foreignKey: 'agentActionId',
      as: 'sopItems',
      onDelete: 'RESTRICT',
    });
    SopChecklistItemModel.belongsTo(AgentActionModel, {
      foreignKey: 'agentActionId',
      as: 'agentAction',
      onDelete: 'RESTRICT',
    });
    // Rows the agent's writes created keep their audit link (append-only agent_action).
    AgentActionModel.hasMany(CouponModel, { foreignKey: 'agentActionId', as: 'coupons', onDelete: 'RESTRICT' });
    CouponModel.belongsTo(AgentActionModel, { foreignKey: 'agentActionId', as: 'agentAction', onDelete: 'RESTRICT' });
    AgentActionModel.hasMany(MarketingCampaignModel, {
      foreignKey: 'agentActionId',
      as: 'marketingCampaigns',
      onDelete: 'RESTRICT',
    });
    MarketingCampaignModel.belongsTo(AgentActionModel, {
      foreignKey: 'agentActionId',
      as: 'agentAction',
      onDelete: 'RESTRICT',
    });
    AgentActionModel.hasMany(MarketingPostModel, { foreignKey: 'agentActionId', as: 'posts', onDelete: 'RESTRICT' });
    MarketingPostModel.belongsTo(AgentActionModel, {
      foreignKey: 'agentActionId',
      as: 'agentAction',
      onDelete: 'RESTRICT',
    });
    AgentActionModel.hasMany(AdCampaignModel, { foreignKey: 'agentActionId', as: 'ads', onDelete: 'RESTRICT' });
    AdCampaignModel.belongsTo(AgentActionModel, {
      foreignKey: 'agentActionId',
      as: 'agentAction',
      onDelete: 'RESTRICT',
    });
    MarketingBudgetPeriodModel.hasMany(MarketingBudgetEntryModel, {
      foreignKey: 'periodId',
      as: 'entries',
      onDelete: 'RESTRICT',
    });
    MarketingBudgetEntryModel.belongsTo(MarketingBudgetPeriodModel, {
      foreignKey: 'periodId',
      as: 'period',
      onDelete: 'RESTRICT',
    });
    AgentActionModel.hasMany(MarketingBudgetEntryModel, {
      foreignKey: 'agentActionId',
      as: 'budgetEntries',
      onDelete: 'RESTRICT',
    });
    MarketingBudgetEntryModel.belongsTo(AgentActionModel, {
      foreignKey: 'agentActionId',
      as: 'agentAction',
      onDelete: 'RESTRICT',
    });
    ProductModel.hasMany(MarketingAssetModel, { foreignKey: 'productId', as: 'marketingAssets', onDelete: 'SET NULL' });
    MarketingAssetModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product', onDelete: 'SET NULL' });
    MarketCompetitorModel.hasMany(MarketCompetitorPriceModel, {
      foreignKey: 'competitorId',
      as: 'prices',
      onDelete: 'CASCADE',
    });
    MarketCompetitorPriceModel.belongsTo(MarketCompetitorModel, {
      foreignKey: 'competitorId',
      as: 'competitor',
      onDelete: 'CASCADE',
    });
    ProductModel.hasMany(MarketCompetitorPriceModel, {
      foreignKey: 'ourProductId',
      as: 'competitorPrices',
      onDelete: 'SET NULL',
    });
    MarketCompetitorPriceModel.belongsTo(ProductModel, {
      foreignKey: 'ourProductId',
      as: 'ourProduct',
      onDelete: 'SET NULL',
    });
    MarketCompetitorModel.hasMany(MarketCompetitorCampaignModel, {
      foreignKey: 'competitorId',
      as: 'campaigns',
      onDelete: 'CASCADE',
    });
    MarketCompetitorCampaignModel.belongsTo(MarketCompetitorModel, {
      foreignKey: 'competitorId',
      as: 'competitor',
      onDelete: 'CASCADE',
    });
  }

  private static async dropTables(sequelize: Sequelize) {
    try {
      for (const model of DatabaseProvider.models) {
        sequelize.addModels([model]);
        const queryInterface = await sequelize.getQueryInterface();

        const tableName = model.options['tableName'];
        // const tableName = tableOptions?.options?.tableName
        //   ? tableOptions?.options?.tableName
        //   : model.name.replace('Model', '');
        Logger.INFO('Dropping table: ', tableName);
        //remove model from sequelize
        delete sequelize.models[model.name];
        await queryInterface.dropTable(tableName || '', { cascade: true });
      }
      // The migration log goes too: a dropped database runs every migration again (they are idempotent).
      await sequelize.getQueryInterface().dropTable(MIGRATION_TABLE);
    } catch (error) {
      Logger.ERROR(`Error dropping tables: ${error}`);
      failIfStrict(error);
    }
  }

  private static async tableExists(model: any, sequelize: Sequelize): Promise<boolean> {
    try {
      const queryInterface = sequelize.getQueryInterface();
      const t = model.tableName;
      const tableName = t ? t : model.name.replace('Model', '');
      return await queryInterface.tableExists(tableName);
    } catch (error) {
      Logger.ERROR(`Error checking table exists: ${error}`);
      throw error;
    }
  }

  private constructor() {}

  public static getInstance(): Sequelize {
    if (!DatabaseProvider.instance) {
      DatabaseProvider.instance = DatabaseProvider.createInstance();
      // Load models, set up associations, etc.
    }
    return DatabaseProvider.instance;
  }

  public static async initialize() {
    try {
      //get connect instance
      const sequelize = DatabaseProvider.getInstance();
      // Await the authentication promise
      await sequelize.authenticate();
      Logger.INFO('process.env.DROP_TABLES', process.env.DROP_TABLES);
      if (process.env.DROP_TABLES == 'true') {
        const database = process.env.DB_NAME || '';
        if (!database.endsWith('_test') && !database.endsWith('_demo')) {
          throw new Error('Destructive seeding requires an explicitly named disposable _test or _demo database.');
        }
        await DatabaseProvider.dropTables(sequelize);
      }
      // load models and their relations into the connection, then create and seed tables
      await DatabaseProvider.loadModels(sequelize);
      // Tables and columns that existing databases lack (after a seed they are all there already).
      await runMigrations(sequelize);
      // Read-only views for the shop agent; they need the tables, so they come after the models.
      await applyAnalyticsViews(sequelize);

      Logger.INFO('Database connection has been established successfully.');
      // Load models and associations if not already done in getInstance
    } catch (error) {
      Logger.ERROR('Unable to connect to the database:', error);
      failIfStrict(error);
    }
  }
}
