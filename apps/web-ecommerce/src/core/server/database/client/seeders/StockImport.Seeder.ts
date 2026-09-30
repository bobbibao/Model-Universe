import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import { daysAgo, historyDays } from './SeedClock';
import { productTier } from './SeedCatalog';
import StockImportModel from '../models/StockImport.Model';
import StockImportItemModel from '../models/StockImportItem.Model';
import ProductModel from '../models/Product.Model';
import SupplierModel from '../models/Supplier.Model';
import UserModel from '../../internal/models/User.Model';

// Demo goods receipts (the seeded stock figures are not touched):
// - products that sell are restocked every few weeks, and all of them within the last RESTOCK_WINDOW_DAYS;
// - slow products were received once, long ago: SOP-001's dead-stock candidates;
// - new arrivals were received when they were added.
const RESTOCK_EVERY_DAYS = 30;
const RESTOCK_SHARE = 0.4;
const RESTOCK_WINDOW_DAYS = 45;
const SLOW_RECEIPT_MIN_DAYS = 100;
const SLOW_RECEIPT_MAX_DAYS = 200;

export const seedStockImportData = async (): Promise<void> => {
  try {
    const admin = await UserModel.findOne({ where: { role: 'ADMIN' } });
    const suppliers = await SupplierModel.findAll({ where: { isActive: true }, order: [['id', 'ASC']] });
    const products = await ProductModel.findAll({ order: [['id', 'ASC']] });
    if (!admin || suppliers.length === 0 || products.length === 0) {
      Logger.WARN('No admin, supplier or product found: stock imports were not seeded.');
      return;
    }

    const receipts: { createdAt: Date; products: ProductModel[]; note: string }[] = [];
    const selling = products.filter((product) => ['popular', 'normal'].includes(productTier(product.sku)));
    for (let age = historyDays() - 1; age > RESTOCK_WINDOW_DAYS; age -= RESTOCK_EVERY_DAYS) {
      const share = Math.max(2, Math.round(selling.length * RESTOCK_SHARE));
      receipts.push({
        createdAt: daysAgo(age),
        products: faker.helpers.arrayElements(selling, share),
        note: 'Nhập hàng định kỳ',
      });
    }
    // Every product that sells was restocked recently, in two receipts.
    const half = Math.ceil(selling.length / 2);
    receipts.push({
      createdAt: daysAgo(faker.number.int({ min: 25, max: RESTOCK_WINDOW_DAYS })),
      products: selling.slice(0, half),
      note: 'Bổ sung hàng bán chạy',
    });
    receipts.push({
      createdAt: daysAgo(faker.number.int({ min: 5, max: 24 })),
      products: selling.slice(half),
      note: 'Bổ sung hàng bán chạy',
    });
    for (const product of products.filter((item) => productTier(item.sku) === 'slow')) {
      receipts.push({
        createdAt: daysAgo(faker.number.int({ min: SLOW_RECEIPT_MIN_DAYS, max: SLOW_RECEIPT_MAX_DAYS })),
        products: [product],
        note: 'Nhập hàng theo mùa',
      });
    }
    for (const product of products.filter((item) => productTier(item.sku) === 'new')) {
      receipts.push({ createdAt: product.createdAt, products: [product], note: 'Hàng mới về' });
    }
    receipts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const receipt of receipts) {
      const lines = receipt.products.map((product) => ({
        productId: product.id,
        quantity: faker.number.int({ min: 10, max: 60 }),
        importPrice: product.importPrice,
        createdAt: receipt.createdAt,
        updatedAt: receipt.createdAt,
      }));
      const stockImport = await StockImportModel.create(
        {
          supplierId: faker.helpers.arrayElement(suppliers).id,
          createdBy: admin.id,
          note: receipt.note,
          totalCost: lines.reduce((sum, line) => sum + line.quantity * line.importPrice, 0),
          createdAt: receipt.createdAt,
          updatedAt: receipt.createdAt,
        },
        { silent: true },
      );
      await StockImportItemModel.bulkCreate(lines.map((line) => ({ ...line, stockImportId: stockImport.id })));
    }
    Logger.INFO(`${receipts.length} stock imports seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the stock import table:', error);
    failIfStrict(error);
  }
};
