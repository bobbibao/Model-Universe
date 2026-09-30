import { Op, Transaction } from 'sequelize';
import ProductModel from '../database/client/models/Product.Model';
import ProductDiscountModel from '../database/client/models/ProductDiscount.Model';

export interface ActiveDiscount {
  percent: number;
  endsAt: Date;
}

// Price fields added to every storefront product payload. `price` stays the list price.
export interface ProductPricing {
  salePrice: number;
  discountPercent: number;
  discountEndsAt: Date | null;
}

// Whole VND, like every other amount in the shop.
export const applyDiscount = (price: number, percent: number): number => Math.round((price * (100 - percent)) / 100);

export const toPricing = (price: number, discount?: ActiveDiscount): ProductPricing => ({
  salePrice: discount ? applyDiscount(price, discount.percent) : price,
  discountPercent: discount?.percent ?? 0,
  discountEndsAt: discount?.endsAt ?? null,
});

// The single source of the effective price: storefront listings, the cart quote and checkout all use it,
// so the price a customer sees is the price they pay.
export default class ProductDiscountService {
  // Discounts running at `now` (not revoked, started, not ended). When several overlap, the highest wins.
  async getActive(
    productIds: number[],
    options: { transaction?: Transaction; now?: Date } = {},
  ): Promise<Map<number, ActiveDiscount>> {
    const active = new Map<number, ActiveDiscount>();
    if (productIds.length === 0) return active;
    const now = options.now ?? new Date();
    const rows = await ProductDiscountModel.findAll({
      where: {
        productId: { [Op.in]: productIds },
        revokedAt: null,
        startsAt: { [Op.lte]: now },
        endsAt: { [Op.gt]: now },
      },
      transaction: options.transaction,
    });
    for (const row of rows) {
      const current = active.get(row.productId);
      if (!current || row.percent > current.percent) {
        active.set(row.productId, { percent: row.percent, endsAt: row.endsAt });
      }
    }
    return active;
  }

  // Plain product objects with the pricing fields added, for API responses.
  async withPricing(products: ProductModel[]) {
    const active = await this.getActive(products.map((product) => product.id));
    return products.map((product) => ({
      ...product.get({ plain: true }),
      ...toPricing(product.price, active.get(product.id)),
    }));
  }
}
