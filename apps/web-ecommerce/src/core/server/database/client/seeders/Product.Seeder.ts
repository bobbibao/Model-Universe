import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import CategoryModel from '../models/Category.Model';
import SupplierModel from '../models/Supplier.Model';
import ProductModel from '../models/Product.Model';
import ProductImageModel from '../models/ProductImage.Model';
// Imported (not read from disk) so the compiled server (dist/, the e2e seed) carries it too.
import seedProducts from './data/products.json';

// Demo product catalog (seeders/data/products.json), prices in USD.
export interface SeedReview {
  location: string;
  rating: number;
  date: string;
  title: string;
  content: string;
}

export interface SeedProduct {
  sku: string;
  name: string;
  brandName: string;
  gender: 'male' | 'female';
  category: string;
  availableSizes: string[];
  isInStock: boolean;
  priceUsd: number;
  productionDate: string;
  imageUrl: string;
  additionalImageUrls: string[];
  reviews: SeedReview[];
}

const USD_TO_VND = 25000;
const IMPORT_PRICE_RATIO = 0.6;
const FEATURED_EVERY = 10;

const roundToThousand = (amount: number) => Math.round(amount / 1000) * 1000;

export const loadSeedProducts = (): SeedProduct[] => seedProducts as SeedProduct[];

export const seedProductData = async (): Promise<void> => {
  try {
    const categories = await CategoryModel.findAll();
    const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));
    const supplierIds = (await SupplierModel.findAll({ where: { isActive: true } })).map((supplier) => supplier.id);

    const seedProducts = loadSeedProducts();
    for (const [index, item] of seedProducts.entries()) {
      const price = roundToThousand(item.priceUsd * USD_TO_VND);
      const product = await ProductModel.create({
        sku: item.sku,
        name: item.name,
        brandName: item.brandName,
        description: `${item.name} chính hãng ${item.brandName}. Chất liệu bền đẹp, thiết kế hiện đại, phù hợp cho hoạt động hằng ngày.`,
        gender: item.gender,
        availableSizes: item.availableSizes,
        price,
        importPrice: roundToThousand(price * IMPORT_PRICE_RATIO),
        stock: item.isInStock ? faker.number.int({ min: 5, max: 80 }) : 0,
        sold: faker.number.int({ min: 0, max: 150 }),
        imageUrl: item.imageUrl,
        isFeatured: index % FEATURED_EVERY === 0,
        isArchived: false,
        productionDate: new Date(item.productionDate),
        categoryId: categoryIdBySlug.get(item.category),
        supplierId: supplierIds.length > 0 ? faker.helpers.arrayElement(supplierIds) : null,
      });
      // The first additional image repeats the main image in the source data.
      const gallery = item.additionalImageUrls.filter((url) => url !== item.imageUrl);
      await ProductImageModel.bulkCreate(gallery.map((url, sortOrder) => ({ productId: product.id, url, sortOrder })));
    }
    Logger.INFO(`${seedProducts.length} products seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the product table:', error);
    failIfStrict(error);
  }
};
