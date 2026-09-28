import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import ProductModel from '../models/Product.Model';
import ReviewModel from '../models/Review.Model';
import UserModel from '../../internal/models/User.Model';
import { loadSeedProducts } from './Product.Seeder';
import { refreshProductRating } from '../../../services/ReviewService';

// Demo reviews from the seed catalog, attributed to random demo customers.
export const seedReviewData = async (): Promise<void> => {
  try {
    const customerIds = (await UserModel.findAll({ where: { role: 'USER' } })).map((user) => user.id);
    if (customerIds.length === 0) {
      Logger.WARN('No customers found: reviews were not seeded.');
      return;
    }

    let count = 0;
    for (const item of loadSeedProducts()) {
      const product = await ProductModel.findOne({ where: { sku: item.sku } });
      if (!product || item.reviews.length === 0) continue;

      const createdAt = (date: string) => (isNaN(Date.parse(date)) ? faker.date.past({ years: 2 }) : new Date(date));
      await ReviewModel.bulkCreate(
        item.reviews.map((review) => ({
          productId: product.id,
          userId: faker.helpers.arrayElement(customerIds),
          rating: review.rating,
          title: review.title,
          content: review.content,
          location: review.location,
          createdAt: createdAt(review.date),
        })),
      );
      await refreshProductRating(product.id);
      count += item.reviews.length;
    }
    Logger.INFO(`${count} reviews seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the review table:', error);
  }
};
