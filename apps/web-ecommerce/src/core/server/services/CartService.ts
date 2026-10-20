import { Op, Transaction } from 'sequelize';
import ProductModel, { isSellable } from '../database/client/models/Product.Model';
import ProductDiscountService, { ProductPricing, toPricing } from './ProductDiscountService';
import PromotionService, { BENEFIT_MESSAGES } from './PromotionService';
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

  // Public quote for the cart page and header: current prices, totals and per-line problems.
  // The cart priced from the database with the customer's benefits (src/shared/promotions.ts): one discount code, one
  // free-shipping code (against `shippingFeeVnd`, the quoted carrier fee) and points. Refused benefits come back with
  // their reason, so the cart explains them before checkout.
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
    const { stack, voucher, freeship } = await new PromotionService().resolve({
      userId: options.userId,
      lines,
      products,
      shippingFeeVnd,
      couponCode: options.couponCode,
      freeshipCode: options.freeshipCode,
      redeemPoints: options.redeemPoints,
    });
    const discount = stack.voucherDiscountVnd + stack.pointsDiscountVnd;
    return {
      lines,
      subtotal,
      benefitSubtotalVnd,
      discount,
      voucherDiscountVnd: stack.voucherDiscountVnd,
      voucherRefusal: voucher && stack.voucherRefusal ? BENEFIT_MESSAGES[stack.voucherRefusal] : null,
      shippingDiscountVnd: stack.shippingDiscountVnd,
      freeshipRefusal: freeship && stack.freeshipRefusal ? BENEFIT_MESSAGES[stack.freeshipRefusal] : null,
      pointsUsed: stack.pointsUsed,
      pointsDiscountVnd: stack.pointsDiscountVnd,
      pointsMax: stack.pointsMax,
      total: subtotal - discount,
      couponCode: voucher && !stack.voucherRefusal ? voucher.code : null,
      freeshipCode: freeship && !stack.freeshipRefusal ? freeship.code : null,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      hasIssues: lines.some((line) => line.status !== 'OK'),
    };
  }
}
