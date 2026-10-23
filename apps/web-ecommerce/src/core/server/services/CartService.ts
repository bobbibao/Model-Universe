import { Op, Transaction } from 'sequelize';
import ProductModel, { isSellable } from '../database/client/models/Product.Model';
import ProductDiscountService, { ProductPricing, toPricing } from './ProductDiscountService';
import { earnedPoints } from '../../../shared/promotions';
import PromotionService, { BENEFIT_MESSAGES, RANK_REFUSAL_MESSAGE } from './PromotionService';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';

export interface CartItemInput {
  productId: number;
  size: string;
  quantity: number;
}

export type CartLineStatus = 'OK' | 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'INVALID_SIZE';

export interface CartLine {
  productId: number;
  size: string;
  quantity: number;
  status: CartLineStatus;
  message?: string;
  availableStock: number;
  lineTotal: number;
  // `price` is the list price; `salePrice` (after any running discount) is what the line is charged at.
  product:
    (Pick<ProductModel, 'id' | 'name' | 'brandName' | 'imageUrl' | 'price' | 'partnerId'> & ProductPricing) | null;
}

const MAX_CART_LINES = 100;
const MAX_LINE_QUANTITY = 999;

// Cleans the client payload: valid ids and quantities only, identical product/size lines merged.
export const normalizeCartItems = (raw: unknown): CartItemInput[] => {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, CartItemInput>();
  for (const entry of raw.slice(0, MAX_CART_LINES)) {
    const productId = toInteger(entry?.productId);
    const quantity = toInteger(entry?.quantity);
    if (!productId || productId <= 0 || !quantity || quantity <= 0) continue;
    const size = asTrimmedString(entry?.size);
    const key = `${productId}::${size}`;
    const existing = merged.get(key);
    merged.set(key, {
      productId,
      size,
      quantity: Math.min(MAX_LINE_QUANTITY, (existing?.quantity || 0) + quantity),
    });
  }
  return Array.from(merged.values());
};

export default class CartService {
  private discountService = new ProductDiscountService();

  // Prices and availability always come from the database, never from the client.
  // With `lock`, product rows are locked for the transaction (used when an order is placed).
  async resolveLines(
    items: CartItemInput[],
    options: { transaction?: Transaction; lock?: boolean } = {},
  ): Promise<{ lines: CartLine[]; products: Map<number, ProductModel> }> {
    const ids = Array.from(new Set(items.map((item) => item.productId)));
    const products = ids.length
      ? await ProductModel.findAll({
          where: { id: { [Op.in]: ids } },
          order: [['id', 'ASC']],
          transaction: options.transaction,
          lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined,
        })
      : [];
    const productById = new Map(products.map((product) => [product.id, product]));
    const discounts = await this.discountService.getActive(ids, { transaction: options.transaction });
    const summarize = (product: ProductModel) => ({
      id: product.id,
      partnerId: product.partnerId,
      name: product.name,
      brandName: product.brandName,
      imageUrl: product.imageUrl,
      price: product.price,
      ...toPricing(product.price, discounts.get(product.id)),
    });

    // Stock is per product, so quantities of different sizes are added up.
    const requestedByProduct = new Map<number, number>();
    items.forEach((item) =>
      requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) || 0) + item.quantity),
    );

    const lines = items.map((item): CartLine => {
      const product = productById.get(item.productId);
      if (!product || !isSellable(product)) {
        return {
          ...item,
          status: 'UNAVAILABLE',
          message: 'Sản phẩm không còn được bán.',
          availableStock: 0,
          lineTotal: 0,
          product: product ? summarize(product) : null,
        };
      }
      const summary = summarize(product);
      const base = { ...item, availableStock: product.stock, product: summary };
      const sizes = product.availableSizes || [];
      if ((sizes.length > 0 && !sizes.includes(item.size)) || (sizes.length === 0 && item.size)) {
        return { ...base, status: 'INVALID_SIZE', message: 'Kích thước này không còn được cung cấp.', lineTotal: 0 };
      }
      if (product.stock <= 0) {
        return { ...base, status: 'OUT_OF_STOCK', message: 'Sản phẩm đã hết hàng.', lineTotal: 0 };
      }
      if ((requestedByProduct.get(product.id) || 0) > product.stock) {
        return {
          ...base,
          status: 'INSUFFICIENT_STOCK',
          message: `Chỉ còn ${product.stock} sản phẩm trong kho (tính cả các kích thước khác trong giỏ).`,
          lineTotal: 0,
        };
      }
      return { ...base, status: 'OK', lineTotal: summary.salePrice * item.quantity };
    });

    return { lines, products: productById };
  }

  // Public quote for the cart page and header: current prices, totals and per-line problems, priced from the database
  // with the customer's benefits under the rules v6.2 (src/shared/promotions.ts): one main voucher, the rank benefit on
  // top of it when both profit checks pass, and one free-shipping code (against `shippingFeeVnd`, the quoted carrier
  // fee). Refused benefits come back with their reason, so the cart explains them before checkout. `redeemPoints` is
  // ignored here (points buy point vouchers in the wallet) and refused when an order is placed.
  async quote(
    rawItems: unknown,
    options: {
      couponCode?: unknown;
      freeshipCode?: unknown;
      redeemPoints?: unknown;
      shippingFeeVnd?: unknown;
      userId?: number;
    } = {},
  ) {
    const { lines, products } = await this.resolveLines(normalizeCartItems(rawItems));
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const benefitSubtotalVnd = lines
      .filter((line) => line.status === 'OK' && !line.product?.partnerId)
      .reduce((sum, line) => sum + line.lineTotal, 0);
    const shippingFeeVnd = Math.max(0, toInteger(options.shippingFeeVnd) ?? 0);
    const { benefits, voucher, freeship, rank } = await new PromotionService().resolve({
      userId: options.userId,
      lines,
      products,
      shippingFeeVnd,
      couponCode: options.couponCode,
      freeshipCode: options.freeshipCode,
    });
    return {
      lines,
      subtotal,
      benefitSubtotalVnd,
      discount: benefits.discountVnd,
      voucherDiscountVnd: benefits.voucherDiscountVnd,
      voucherRefusal: voucher && benefits.voucherRefusal ? BENEFIT_MESSAGES[benefits.voucherRefusal] : null,
      voucherStatus: voucher ? (benefits.evaluation?.status ?? (benefits.voucherRefusal ? 'VOUCHER_INVALID' : null)) : null,
      rank: rank ? { code: rank.code, tier: rank.tier, bps: rank.bps, capVnd: rank.capVnd } : null,
      rankDiscountVnd: benefits.rankDiscountVnd,
      rankRefusal: rank && benefits.rankRefusal ? RANK_REFUSAL_MESSAGE : null,
      shippingDiscountVnd: benefits.shippingDiscountVnd,
      freeshipRefusal: freeship && benefits.freeshipRefusal ? BENEFIT_MESSAGES[benefits.freeshipRefusal] : null,
      // Kept for older clients: points are no longer spent at checkout.
      pointsUsed: 0,
      pointsDiscountVnd: 0,
      pointsMax: 0,
      // Points the order will earn once completed (one per whole 40,000 VND of shop goods paid).
      earnedPoints: earnedPoints(Math.max(0, benefitSubtotalVnd - benefits.discountVnd)),
      total: subtotal - benefits.discountVnd,
      couponCode: voucher && !benefits.voucherRefusal ? voucher.code : null,
      freeshipCode: freeship && !benefits.freeshipRefusal ? freeship.code : null,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      hasIssues: lines.some((line) => line.status !== 'OK'),
    };
  }
}
