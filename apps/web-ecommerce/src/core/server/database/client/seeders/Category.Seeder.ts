import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import CategoryModel from '../models/Category.Model';

// Slugs match the category keys of the seed products (seeders/data/products.json) and the product types of the
// third-party mecha catalog (ModelUniverseCatalog.ts).
export const CATEGORIES: { slug: string; name: string }[] = [
  { slug: 'gunpla', name: 'Gunpla kits' },
  { slug: 'collector-displays', name: 'Collector displays' },
  { slug: 'tools', name: 'Tools and supplies' },
  { slug: 'accessories', name: 'Accessories and display bases' },
  { slug: 'mecha-model-kits', name: 'Mecha model kits' },
  { slug: 'alloy-figures', name: 'Alloy and finished figures' },
];

export const seedCategoryData = async (): Promise<void> => {
  try {
    await CategoryModel.bulkCreate(CATEGORIES);
    Logger.INFO(`${CATEGORIES.length} categories seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the category table:', error);
    failIfStrict(error);
  }
};
