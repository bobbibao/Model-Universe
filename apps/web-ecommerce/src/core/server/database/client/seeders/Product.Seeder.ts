import { faker } from '@faker-js/faker/locale/en';
import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import { daysAgo, historyDays } from './SeedClock';
import { productTier } from './SeedCatalog';
import CategoryModel from '../models/Category.Model';
import SupplierModel from '../models/Supplier.Model';
import ProductModel from '../models/Product.Model';
import ProductImageModel from '../models/ProductImage.Model';
// Imported (not read from disk) so the compiled server (dist/, the e2e seed) carries it too.
import seedProducts from './data/products.json';
import type { GunplaAttributes } from '../../../../../shared/gunpla';

// Synthetic Gunpla demo catalog. Prices are whole VND; media provenance is recorded in the manifest.
export interface SeedReview {
  location: string;
  rating: number;
  date: string;
  title: string;
  content: string;
}

export interface SeedProduct extends GunplaAttributes {
  sku: string;
  name: string;
  brandName: string;
  category: string;
  availableSizes: string[];
  stock: number;
  priceVnd: number;
  productionDate: string;
  imageUrl: string;
  additionalImageUrls: string[];
  reviews: SeedReview[];
}

const IMPORT_PRICE_RATIO = 0.6;


const CATALOG_AGE_EXTRA_DAYS = 60; // the catalog is older than the sales history
const NEW_ARRIVAL_MAX_DAYS = 12;

const roundToThousand = (amount: number) => Math.round(amount / 1000) * 1000;

export const loadSeedProducts = (): SeedProduct[] => seedProducts as SeedProduct[];

export const seedProductData = async (): Promise<void> => {
  try {
    const categories = await CategoryModel.findAll();
    const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));
    const supplierIds = (await SupplierModel.findAll({ where: { isActive: true } })).map((supplier) => supplier.id);

    const seedProducts = loadSeedProducts();
    for (const [index, item] of seedProducts.entries()) {
      const price = item.priceVnd;
      // New arrivals were added in the last two weeks; the rest of the catalog predates the sales history.
      const createdAt =
        productTier(item.sku) === 'new'
          ? daysAgo(faker.number.int({ min: 2, max: NEW_ARRIVAL_MAX_DAYS }))
          : daysAgo(historyDays() + CATALOG_AGE_EXTRA_DAYS);
      const product = await ProductModel.create(
        {
          sku: item.sku,
          name: item.name,
          brandName: item.brandName,
          description: item.descriptionEn,
          descriptionEn: item.descriptionEn,
          descriptionVi: item.descriptionVi,
          grade: item.grade,
          scale: item.scale,
          series: item.series,
          modelCode: item.modelCode,
          condition: item.condition,
          assemblyState: item.assemblyState,
          boxCondition: item.boxCondition,
          includedAccessories: item.includedAccessories,
          defects: item.defects,
          gender: 'unisex',
          availableSizes: item.availableSizes,
          price,
          importPrice: roundToThousand(price * IMPORT_PRICE_RATIO),
          stock: item.stock,
          // Unique preowned demo items have no invented prior sales.
          sold: item.condition === 'preowned' ? 0 : faker.number.int({ min: 0, max: 150 }),
          imageUrl: item.imageUrl,
          isFeatured: index < 8,
          isArchived: false,
          productionDate: new Date(item.productionDate),
          categoryId: categoryIdBySlug.get(item.category),
          supplierId: supplierIds.length > 0 ? faker.helpers.arrayElement(supplierIds) : null,
          createdAt,
          updatedAt: createdAt,
        },
        { silent: true },
      );
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
