'use client';

import ProductApi from '@/core/client/api/Product';
import WishlistApi from '@/core/client/api/Wishlist';
import ContactApi from '@/core/client/api/Contact';
import ReviewApi from '@/core/client/api/Review';
import OrderApi from '@/core/client/api/Order';
import ReturnApi from '@/core/client/api/Return';
import UserApi from '@/core/client/api/User';
import AuthApi from '@/core/client/api/Auth';
import CouponApi from '@/core/client/api/Coupon';
import CartApi from '@/core/client/api/Cart';
import { parseCustomerAction } from '@/shared/customer-assistant-policy';
import type { CustomerAction } from '@/shared/types/customer-assistant';
import type { CouponPreview } from '@/shared/types/order';
import type { useCart } from '@/shared/client/providers/CartProvider';

type Context = {
  cart: ReturnType<typeof useCart>;
  push: (path: string) => void;
  setCoupon: (coupon: CouponPreview | null) => void;
  refreshUser: () => Promise<void>;
};
const requireResult = <T>(value: T | undefined | false): T => {
  if (value === undefined || value === false) throw new Error('Chưa thực hiện được. Hãy kiểm tra dữ liệu và thử lại.');
  return value;
};
export async function executeCustomerAction(raw: CustomerAction, context: Context): Promise<string> {
  const action = parseCustomerAction(raw);
  if (!action) throw new Error('Thao tác không hợp lệ.');
  const { cart, push } = context;
  switch (action.kind) {
    case 'navigate':
      push(action.path!);
      return 'Đã mở trang bạn yêu cầu.';
    case 'cart_add':
    case 'cart_update':
    case 'wishlist_add': {
      const product = requireResult(await ProductApi.getProduct(action.productId!));
      const size = action.size || '';
      if (product.availableSizes.length ? !product.availableSizes.includes(size) : !!size)
        throw new Error('Chọn kích thước được cung cấp.');
      if (action.kind === 'wishlist_add') {
        requireResult(await WishlistApi.addItem(product.id, size));
        break;
      }
      const existing = cart.entries.find(({ item }) => item.productId === product.id && item.size === size);
      const otherQuantity = cart.entries
        .filter(({ item }) => item.productId === product.id && (action.kind === 'cart_add' || item.size !== size))
        .reduce((sum, { item }) => sum + item.quantity, 0);
      if (otherQuantity + action.quantity! > product.stock)
        throw new Error(`Số lượng vượt tồn kho hiện tại (${product.stock}).`);
      if (action.kind === 'cart_update') {
        if (!existing) throw new Error('Sản phẩm với kích thước này chưa có trong giỏ.');
        cart.updateQuantity(product.id, size, action.quantity!);
      } else requireResult(cart.addItem(product, size, action.quantity!));
      return action.kind === 'cart_add'
        ? `Đã thêm ${action.quantity} ${product.name} vào giỏ.`
        : `Đã cập nhật ${product.name} thành ${action.quantity} sản phẩm.`;
    }
    case 'cart_remove':
      if (!cart.entries.some(({ item }) => item.productId === action.productId && item.size === action.size))
        throw new Error('Sản phẩm này không còn trong giỏ.');
      cart.removeItem(action.productId!, action.size!);
      return 'Đã xóa sản phẩm khỏi giỏ.';
    case 'cart_clear':
      cart.clearCart();
      context.setCoupon(null);
      return 'Đã làm trống giỏ hàng.';
    case 'wishlist_remove': {
      const wishlist = requireResult(await WishlistApi.getWishlist());
      if (!wishlist.some((item) => item.id === action.wishlistItemId))
        throw new Error('Sản phẩm không còn trong danh sách yêu thích.');
      requireResult(await WishlistApi.removeItem(action.wishlistItemId!));
      break;
    }
    case 'apply_coupon': {
      const quote = requireResult(
        await CartApi.getQuote(
          cart.entries.map(({ item }) => ({ productId: item.productId, size: item.size, quantity: item.quantity })),
        ),
      );
      if (!quote.itemCount || quote.hasIssues) throw new Error('Kiểm tra giỏ hàng trước khi áp dụng mã.');
      const coupon = requireResult(await CouponApi.validateCoupon(action.code!, quote.subtotal));
      context.setCoupon(coupon);
      return `Đã áp dụng mã ${coupon.code}.`;
    }
    case 'contact':
      requireResult(
        await ContactApi.sendMessage({
          name: action.name || '',
          email: action.email || '',
          phone: action.phone || '',
          company: action.company || '',
          message: action.message || '',
        }),
      );
      break;
    case 'review': {
      const eligibility = requireResult(await ReviewApi.getEligibility(action.productId!));
      if (!eligibility.canReview) throw new Error(eligibility.reason || 'Bạn chưa đủ điều kiện đánh giá sản phẩm này.');
      if (!action.rating) throw new Error('Chọn số sao dựa trên trải nghiệm của bạn.');
      requireResult(
        await ReviewApi.createReview({
          productId: action.productId!,
          rating: action.rating,
          title: action.title || '',
          content: action.content || '',
        }),
      );
      break;
    }
    case 'cancel_order':
      requireResult(await OrderApi.cancelMyOrder(action.orderId!));
      break;
    case 'return_request':
      requireResult(
        await ReturnApi.createReturn({ orderId: action.orderId!, items: action.returnItems!, note: action.note || '' }),
      );
      break;
    case 'update_profile': {
      const changes: { firstName?: string; lastName?: string; phone?: string; address?: string } = {};
      for (const key of ['firstName', 'lastName', 'phone', 'address'] as const)
        if (action[key] !== undefined) changes[key] = action[key];
      requireResult(await UserApi.updateProfile(changes));
      await context.refreshUser();
      break;
    }
    case 'logout':
      requireResult(await AuthApi.logout());
      await context.refreshUser();
      push('/');
      return 'Đã đăng xuất.';
    default:
      throw new Error('Hãy kiểm tra thông tin và xác nhận ở thẻ thanh toán.');
  }
  window.dispatchEvent(
    new CustomEvent('store:customer-action', { detail: { kind: action.kind, productId: action.productId } }),
  );
  return (
    (
      {
        wishlist_add: 'Đã thêm vào danh sách yêu thích.',
        wishlist_remove: 'Đã xóa khỏi danh sách yêu thích.',
        contact: 'Đã gửi tin nhắn cho cửa hàng.',
        review: 'Đã đăng đánh giá của bạn.',
        cancel_order: `Đã hủy đơn #${action.orderId}.`,
        return_request: `Đã gửi yêu cầu trả hàng cho đơn #${action.orderId}.`,
        update_profile: 'Đã cập nhật thông tin tài khoản.',
      } as Partial<Record<CustomerAction['kind'], string>>
    )[action.kind] || 'Đã thực hiện thao tác.'
  );
}
