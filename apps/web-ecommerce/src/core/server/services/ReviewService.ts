import { Transaction, col, fn } from 'sequelize';
import ReviewModel from '../database/client/models/Review.Model';
import ProductModel from '../database/client/models/Product.Model';
import UserModel from '../database/internal/models/User.Model';
import OrderModel from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 2000;

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

// Recomputes the cached average rating and review count of a product.
export const refreshProductRating = async (productId: number, transaction?: Transaction): Promise<void> => {
  const stats = (await ReviewModel.findOne({
    attributes: [
      [fn('AVG', col('rating')), 'average'],
      [fn('COUNT', col('id')), 'total'],
    ],
    where: { productId },
    raw: true,
    transaction,
  })) as unknown as { average: string | null; total: string } | null;
  await ProductModel.update(
    {
      rating: Math.round(Number(stats?.average || 0) * 10) / 10,
      reviewCount: Number(stats?.total || 0),
    },
    { where: { id: productId }, transaction },
  );
};

export default class ReviewService {
  // Only customers who received the product (a delivered order) can review it, once.
  async getEligibility(userId: number, productId: number): Promise<{ canReview: boolean; reason?: string }> {
    const purchased = await OrderItemModel.count({
      where: { productId },
      include: [{ model: OrderModel, as: 'order', where: { userId, status: 'DELIVERED' }, attributes: [] }],
    });
    if (!purchased) return { canReview: false, reason: 'Bạn cần mua và nhận sản phẩm này trước khi đánh giá.' };
    if (await ReviewModel.count({ where: { userId, productId } })) {
      return { canReview: false, reason: 'Bạn đã đánh giá sản phẩm này.' };
    }
    return { canReview: true };
  }

  async create(userId: number, data: Record<string, unknown>) {
    const productId = toInteger(data.productId);
    const rating = toInteger(data.rating);
    const title = asTrimmedString(data.title);
    const content = asTrimmedString(data.content);
    const errors: string[] = [];
    if (!productId || !(await ProductModel.count({ where: { id: productId } }))) errors.push('Sản phẩm không hợp lệ.');
    if (!rating || rating < 1 || rating > 5) errors.push('Vui lòng chọn số sao từ 1 đến 5.');
    if (!title) errors.push('Vui lòng nhập tiêu đề đánh giá.');
    if (title.length > MAX_TITLE_LENGTH) errors.push(`Tiêu đề tối đa ${MAX_TITLE_LENGTH} ký tự.`);
    if (content.length > MAX_CONTENT_LENGTH) errors.push(`Nội dung tối đa ${MAX_CONTENT_LENGTH} ký tự.`);
    if (errors.length > 0) throw HttpError.badRequest('Đánh giá chưa hợp lệ.', errors);

    const eligibility = await this.getEligibility(userId, productId as number);
    if (!eligibility.canReview) throw HttpError.forbidden(eligibility.reason);

    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      const review = await ReviewModel.create(
        { productId, userId, rating, title, content: content || null },
        { transaction },
      );
      await refreshProductRating(productId as number, transaction);
      return review;
    });
  }

  async listByProduct(productId: number, limit: number, offset: number) {
    const { rows, count } = await ReviewModel.findAndCountAll({
      where: { productId },
      include: [{ model: UserModel, as: 'user', attributes: ['firstName', 'lastName', 'avatar'] }],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset,
    });
    const reviews = rows.map((review) => {
      const user = review.get('user') as UserModel | undefined;
      return {
        id: review.id,
        rating: review.rating,
        title: review.title,
        content: review.content,
        location: review.location,
        createdAt: review.createdAt,
        author: user ? `${user.lastName} ${user.firstName}` : 'Khách hàng',
        authorAvatar: user?.avatar ?? null,
      };
    });
    return { rows: reviews, count };
  }

  async getDistribution(productId: number): Promise<RatingDistribution> {
    const rows = (await ReviewModel.findAll({
      attributes: ['rating', [fn('COUNT', col('id')), 'total']],
      where: { productId },
      group: ['rating'],
      raw: true,
    })) as unknown as { rating: number; total: string }[];
    const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rows.forEach((row) => {
      if (row.rating >= 1 && row.rating <= 5) distribution[row.rating as keyof RatingDistribution] = Number(row.total);
    });
    return distribution;
  }
}
