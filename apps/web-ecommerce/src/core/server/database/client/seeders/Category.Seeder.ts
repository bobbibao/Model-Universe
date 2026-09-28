import Logger from '../../../../../shared/server/utils/logger';
import CategoryModel from '../models/Category.Model';

// Slugs match the category keys of the seed products (seeders/data/products.json).
export const CATEGORIES: { slug: string; name: string }[] = [
  { slug: 'shoes', name: 'Giày' },
  { slug: 'sneakers', name: 'Giày sneaker' },
  { slug: 'trainers', name: 'Giày thể thao' },
  { slug: 'boots', name: 'Bốt' },
  { slug: 'heels', name: 'Giày cao gót' },
  { slug: 'slippers', name: 'Dép' },
  { slug: 't-shirts', name: 'Áo thun' },
  { slug: 'shirts', name: 'Áo sơ mi' },
  { slug: 'overshirts', name: 'Áo khoác sơ mi' },
  { slug: 'sweaters', name: 'Áo len' },
  { slug: 'jackets', name: 'Áo khoác' },
  { slug: 'pants', name: 'Quần dài' },
  { slug: 'jeans', name: 'Quần jeans' },
  { slug: 'shorts', name: 'Quần short' },
  { slug: 'caps', name: 'Mũ lưỡi trai' },
  { slug: 'bags', name: 'Túi xách' },
  { slug: 'belts', name: 'Thắt lưng' },
  { slug: 'socks', name: 'Tất' },
];

export const seedCategoryData = async (): Promise<void> => {
  try {
    await CategoryModel.bulkCreate(CATEGORIES);
    Logger.INFO(`${CATEGORIES.length} categories seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the category table:', error);
  }
};
