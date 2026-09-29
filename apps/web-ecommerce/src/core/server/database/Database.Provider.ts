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
import AgentActionModel from './client/models/AgentAction.Model';
import ProductDiscountModel from './client/models/ProductDiscount.Model';
import AgentTaskModel from './client/models/AgentTask.Model';
import SopChecklistItemModel from './client/models/SopChecklistItem.Model';
import CiNotificationModel from './client/models/CiNotification.Model';
import CiEventModel from './client/models/CiEvent.Model';
import { seedData } from './client/seeders/Seeder';

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
    CouponModel,
    OrderModel,
    OrderItemModel,
    StockImportModel,
    StockImportItemModel,
    ContactMessageModel,
    // CI agent integration (Agent API writes and events from apps/agent-service)
    AgentActionModel,
    ProductDiscountModel,
    AgentTaskModel,
    SopChecklistItemModel,
    CiNotificationModel,
    CiEventModel,
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
    const isDevelopment = process.env.NODE_ENV === 'development'; // Check if it's the development environment

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
      for (const model of DatabaseProvider.models) {
        const tableExistsResult = await DatabaseProvider.tableExists(model, sequelize);
        if (process.env.SEED_DATA == 'true' && !tableExistsResult) {
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
    } catch (error) {
      Logger.ERROR(`Error dropping tables: ${error}`);
    }
  }

  private static async tableExists(model: any, sequelize: Sequelize): Promise<boolean> {
    try {
      const queryInterface = sequelize.getQueryInterface();
      const t = model.tableName;
      const tableName = t ? t : model.name.replace('Model', '');
      const result = await queryInterface.describeTable(tableName);
      return !!result;
    } catch (error) {
      Logger.ERROR(`Error checking table exists: ${error}`);
      return false;
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
        await DatabaseProvider.dropTables(sequelize);
      }
      // load models and their relations into the connection, then create and seed tables
      await DatabaseProvider.loadModels(sequelize);

      Logger.INFO('Database connection has been established successfully.');
      // Load models and associations if not already done in getInstance
    } catch (error) {
      Logger.ERROR('Unable to connect to the database:', error);
    }
  }
}
