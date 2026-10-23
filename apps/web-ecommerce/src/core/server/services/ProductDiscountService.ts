import { Op, Transaction } from 'sequelize';
import ProductModel from '../database/client/models/Product.Model';
import ProductDiscountModel from '../database/client/models/ProductDiscount.Model';
import { safeSalePercent } from '../../../shared/sale-pricing';
import PricingApprovalService from './PricingApprovalService';

export interface ActiveDiscount {
  managedSale?: boolean;
  saleEventId?: number;
  percent: number;
  endsAt: Date;
}

// Price fields added to every storefront product payload. `price` stays the list price.
export interface ProductPricing {
  managedSale?: boolean;
  saleEventId?: number;
  salePrice: number;
  discountPercent: number;
  discountEndsAt: Date | null;
}

// Whole VND, like every other amount in the shop.
export const applyDiscount = (price: number, percent: number): number => price - Math.round((price * percent) / 100);

export const toPricing = (price: number, discount?: ActiveDiscount): ProductPricing => ({
  salePrice: discount ? applyDiscount(price, discount.percent) : price,
  discountPercent: discount?.percent ?? 0,
  discountEndsAt: discount?.endsAt ?? null,
  ...(discount?.managedSale ? { managedSale: true } : {}),
  ...(discount?.saleEventId ? { saleEventId: discount.saleEventId } : {}),
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
      order: [
        ['percent', 'DESC'],
        ['id', 'ASC'],
      ],
    });
    const ownedRows = rows.filter((row) => row.campaignRef?.startsWith('store-sale:'));
    const currentProducts = ownedRows.length
      ? await ProductModel.findAll({
          attributes: ['id', 'price', 'importPrice', 'partnerId'],
          where: { id: { [Op.in]: ownedRows.map((row) => row.productId) } },
          transaction: options.transaction,
        })
      : [];
    const byId = new Map(currentProducts.map((p) => [p.id, p]));
    const costs = currentProducts.length
      ? await new PricingApprovalService().unitCosts(currentProducts, options.transaction)
      : new Map<number, number>();
    for (const row of rows) {
      if (row.campaignRef?.startsWith('store-sale:')) {
        const p = byId.get(row.productId);
        if (!p || p.partnerId || !safeSalePercent(p.price, costs.get(p.id) ?? p.importPrice, row.percent)) continue;
      }
      const current = active.get(row.productId);
      if (!current || row.percent > current.percent) {
        active.set(row.productId, {
          percent: row.percent,
          endsAt: row.endsAt,
          ...(row.campaignRef?.startsWith('store-sale:')
            ? { managedSale: true, saleEventId: Number(row.campaignRef.slice('store-sale:'.length)) }
            : {}),
        });
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
