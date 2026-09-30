import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import StockImportModel from '../models/StockImport.Model';
import StockImportItemModel from '../models/StockImportItem.Model';
import ProductModel from '../models/Product.Model';
import SupplierModel from '../models/Supplier.Model';
import UserModel from '../../internal/models/User.Model';

const IMPORT_COUNT = 12;
const HISTORY_DAYS = 240;
const DAY_MS = 24 * 60 * 60 * 1000;

// Demo goods receipts spread over the last months. The seeded stock figures are not touched.
export const seedStockImportData = async (): Promise<void> => {
  try {
    const admin = await UserModel.findOne({ where: { role: 'ADMIN' } });
    const suppliers = await SupplierModel.findAll({ where: { isActive: true } });
    const products = await ProductModel.findAll();
    if (!admin || suppliers.length === 0 || products.length === 0) {
      Logger.WARN('No admin, supplier or product found: stock imports were not seeded.');
      return;
    }

    for (let index = 0; index < IMPORT_COUNT; index++) {
      const createdAt = new Date(Date.now() - faker.number.int({ min: 1, max: HISTORY_DAYS }) * DAY_MS);
      // Typed explicitly: with moduleResolution "node", faker's `helpers` module types don't resolve (they are `any`).
      const picked: ProductModel[] = faker.helpers.arrayElements(products, { min: 2, max: 5 });
      const lines = picked.map((product) => ({
        productId: product.id,
        quantity: faker.number.int({ min: 10, max: 60 }),
        importPrice: product.importPrice,
        createdAt,
        updatedAt: createdAt,
      }));
      const stockImport = await StockImportModel.create(
        {
          supplierId: faker.helpers.arrayElement(suppliers).id,
          createdBy: admin.id,
          note: faker.helpers.arrayElement([null, 'Nhập hàng định kỳ', 'Bổ sung hàng bán chạy']),
          totalCost: lines.reduce((sum, line) => sum + line.quantity * line.importPrice, 0),
          createdAt,
          updatedAt: createdAt,
        },
        { silent: true },
      );
      await StockImportItemModel.bulkCreate(lines.map((line) => ({ ...line, stockImportId: stockImport.id })));
    }
    Logger.INFO(`${IMPORT_COUNT} stock imports seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the stock import table:', error);
    failIfStrict(error);
  }
};
