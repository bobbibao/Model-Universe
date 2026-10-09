jest.mock('../../src/core/client/api/Product', () => ({ __esModule: true, default: { getProduct: jest.fn() } }));
jest.mock('../../src/core/client/api/Wishlist', () => ({
  __esModule: true,
  default: { getWishlist: jest.fn(), addItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('../../src/core/client/api/Contact', () => ({ __esModule: true, default: { sendMessage: jest.fn() } }));
jest.mock('../../src/core/client/api/Review', () => ({
  __esModule: true,
  default: { getEligibility: jest.fn(), createReview: jest.fn() },
}));
jest.mock('../../src/core/client/api/Order', () => ({ __esModule: true, default: { cancelMyOrder: jest.fn() } }));
jest.mock('../../src/core/client/api/Return', () => ({ __esModule: true, default: { createReturn: jest.fn() } }));
jest.mock('../../src/core/client/api/User', () => ({ __esModule: true, default: { updateProfile: jest.fn() } }));
jest.mock('../../src/core/client/api/Auth', () => ({ __esModule: true, default: { logout: jest.fn() } }));
jest.mock('../../src/core/client/api/Coupon', () => ({ __esModule: true, default: { validateCoupon: jest.fn() } }));
jest.mock('../../src/core/client/api/Cart', () => ({ __esModule: true, default: { getQuote: jest.fn() } }));

import ProductApi from '../../src/core/client/api/Product';
import WishlistApi from '../../src/core/client/api/Wishlist';
import ReviewApi from '../../src/core/client/api/Review';
import ContactApi from '../../src/core/client/api/Contact';
import OrderApi from '../../src/core/client/api/Order';
import ReturnApi from '../../src/core/client/api/Return';
import UserApi from '../../src/core/client/api/User';
import AuthApi from '../../src/core/client/api/Auth';
import CouponApi from '../../src/core/client/api/Coupon';
import CartApi from '../../src/core/client/api/Cart';
import vi from '../../src/messages/vi.json';
import en from '../../src/messages/en.json';
import { executeCustomerAction } from '../../src/core/client/features/assistant/executeCustomerAction';

const product = { id: 3, name: 'Synthetic MG Gundam', stock: 5, availableSizes: ['M', 'L'], price: 700000, salePrice: 600000 };
const setup = () => ({
  cart: {
    entries: [] as { item: { productId: number; size: string; quantity: number } }[],
    addItem: jest.fn().mockReturnValue(true),
    updateQuantity: jest.fn(),
    removeItem: jest.fn(),
    clearCart: jest.fn(),
  },
  push: jest.fn(),
  setCoupon: jest.fn(),
  refreshUser: jest.fn(),
  translate: (key: string, values: Record<string, string | number> = {}) => {
    const message = vi.assistantActions[key as keyof typeof vi.assistantActions];
    if (typeof message !== 'string') throw new Error(`Missing translation ${key}`);
    return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
  },
});
describe('customer action execution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.window = { dispatchEvent: jest.fn() } as unknown as Window & typeof globalThis;
    jest.mocked(ProductApi.getProduct).mockResolvedValue(product as never);
  });
  afterAll(() => {
    delete (global as { window?: unknown }).window;
  });
  it('uses a fresh product lookup and requires an actual available size', async () => {
    const context = setup();
    await expect(
      executeCustomerAction({ kind: 'cart_add', productId: 3, quantity: 1, size: 'XL' }, context as never),
    ).rejects.toThrow('kích thước');
    expect(context.cart.addItem).not.toHaveBeenCalled();
    await executeCustomerAction(
      { kind: 'cart_add', productId: 3, quantity: 1, size: 'M', product: { ...product, stock: 999 } as never },
      context as never,
    );
    expect(context.cart.addItem).toHaveBeenCalledWith(product, 'M', 1);
  });
  it('checks aggregate stock across sizes before cart mutations', async () => {
    const context = setup();
    context.cart.entries = [{ item: { productId: 3, size: 'M', quantity: 3 } }];
    await expect(
      executeCustomerAction({ kind: 'cart_add', productId: 3, size: 'L', quantity: 3 }, context as never),
    ).rejects.toThrow('tồn kho');
    expect(context.cart.addItem).not.toHaveBeenCalled();
    await executeCustomerAction({ kind: 'cart_update', productId: 3, size: 'M', quantity: 4 }, context as never);
    expect(context.cart.updateQuantity).toHaveBeenCalledWith(3, 'M', 4);
  });
  it('checks review eligibility and does not invent a rating', async () => {
    const context = setup();
    jest.mocked(ReviewApi.getEligibility).mockResolvedValue({ canReview: true });
    await expect(
      executeCustomerAction({ kind: 'review', productId: 3, title: 'Trải nghiệm' }, context as never),
    ).rejects.toThrow('số sao');
    expect(ReviewApi.createReview).not.toHaveBeenCalled();
    jest.mocked(ReviewApi.getEligibility).mockResolvedValue({ canReview: false, reason: 'Chưa mua hàng' });
    await expect(executeCustomerAction({ kind: 'review', productId: 3, rating: 4 }, context as never)).rejects.toThrow(
      'Chưa mua hàng',
    );
    expect(ReviewApi.createReview).not.toHaveBeenCalled();
  });
  it('sends the customer-edited contact and reports failed calls without claiming success', async () => {
    const context = setup();
    jest.mocked(ContactApi.sendMessage).mockResolvedValue(true);
    await executeCustomerAction(
      { kind: 'contact', name: 'Lan', email: 'lan@example.test', message: 'Tôi đã sửa nội dung.' },
      context as never,
    );
    expect(ContactApi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'Tôi đã sửa nội dung.' }));
    jest.mocked(ContactApi.sendMessage).mockResolvedValue(false);
    await expect(executeCustomerAction({ kind: 'contact', message: 'Retry' }, context as never)).rejects.toThrow(
      'Chưa thực hiện',
    );
  });
  it('does not remove a wishlist item outside the signed-in wishlist or navigate into admin', async () => {
    const context = setup();
    jest.mocked(WishlistApi.getWishlist).mockResolvedValue([]);
    await expect(
      executeCustomerAction({ kind: 'wishlist_remove', wishlistItemId: 99 }, context as never),
    ).rejects.toThrow('không còn');
    expect(WishlistApi.removeItem).not.toHaveBeenCalled();
    await expect(executeCustomerAction({ kind: 'navigate', path: '/admin/agent' }, context as never)).rejects.toThrow(
      'không hợp lệ',
    );
    expect(context.push).not.toHaveBeenCalled();
  });
  it('adds a size-free Gunpla kit and updates only an existing cart line', async () => {
    const context = setup();
    jest.mocked(ProductApi.getProduct).mockResolvedValue({ ...product, availableSizes: [] } as never);
    await executeCustomerAction({ kind: 'cart_add', productId: 3, size: '', quantity: 2 }, context as never);
    expect(context.cart.addItem).toHaveBeenCalledWith(expect.objectContaining({ availableSizes: [] }), '', 2);
    await expect(executeCustomerAction({ kind: 'cart_update', productId: 3, size: '', quantity: 1 }, context as never))
      .rejects.toThrow('chưa có trong giỏ');
    expect(context.cart.updateQuantity).not.toHaveBeenCalled();
  });
  it('removes only a present line and clears both cart and coupon', async () => {
    const context = setup();
    context.cart.entries = [{ item: { productId: 3, size: '', quantity: 1 } }];
    await executeCustomerAction({ kind: 'cart_remove', productId: 3, size: '' }, context as never);
    expect(context.cart.removeItem).toHaveBeenCalledWith(3, '');
    await executeCustomerAction({ kind: 'cart_clear' }, context as never);
    expect(context.cart.clearCart).toHaveBeenCalledTimes(1);
    expect(context.setCoupon).toHaveBeenCalledWith(null);
  });
  it('adds a verified kit to the wishlist and removes an owned wishlist record', async () => {
    const context = setup();
    jest.mocked(ProductApi.getProduct).mockResolvedValue({ ...product, availableSizes: [] } as never);
    jest.mocked(WishlistApi.addItem).mockResolvedValue(true as never);
    jest.mocked(WishlistApi.getWishlist).mockResolvedValue([{ id: 601, productId: 3 }] as never);
    jest.mocked(WishlistApi.removeItem).mockResolvedValue(true as never);
    await executeCustomerAction({ kind: 'wishlist_add', productId: 3, size: '' }, context as never);
    await executeCustomerAction({ kind: 'wishlist_remove', wishlistItemId: 601 }, context as never);
    expect(WishlistApi.addItem).toHaveBeenCalledWith(3, '');
    expect(WishlistApi.removeItem).toHaveBeenCalledWith(601);
  });
  it('uses a fresh quote for coupons and rejects an invalid cart', async () => {
    const context = setup();
    context.cart.entries = [{ item: { productId: 3, size: '', quantity: 2 } }];
    jest.mocked(CartApi.getQuote).mockResolvedValue({ itemCount: 2, hasIssues: false, subtotal: 1200000 } as never);
    jest.mocked(CouponApi.validateCoupon).mockResolvedValue({ code: 'KIT10' } as never);
    await executeCustomerAction({ kind: 'apply_coupon', code: 'KIT10' }, context as never);
    expect(CouponApi.validateCoupon).toHaveBeenCalledWith('KIT10', 1200000);
    expect(context.setCoupon).toHaveBeenCalledWith({ code: 'KIT10' });
    jest.mocked(CartApi.getQuote).mockResolvedValue({ itemCount: 2, hasIssues: true } as never);
    await expect(executeCustomerAction({ kind: 'apply_coupon', code: 'KIT10' }, context as never)).rejects.toThrow('Kiểm tra giỏ');
    expect(CouponApi.validateCoupon).toHaveBeenCalledTimes(1);
  });
  it('passes customer-owned order operations to the authoritative APIs and propagates denial', async () => {
    const context = setup();
    jest.mocked(OrderApi.cancelMyOrder).mockResolvedValue(true as never);
    jest.mocked(ReturnApi.createReturn).mockResolvedValue({ id: 1 } as never);
    const items = [{ orderItemId: 801, quantity: 1, reason: 'missing_accessories' }];
    await executeCustomerAction({ kind: 'cancel_order', orderId: 701 }, context as never);
    await executeCustomerAction({ kind: 'return_request', orderId: 702, returnItems: items, note: 'Missing runner' } as never, context as never);
    expect(OrderApi.cancelMyOrder).toHaveBeenCalledWith(701);
    expect(ReturnApi.createReturn).toHaveBeenCalledWith({ orderId: 702, items, note: 'Missing runner' });
    jest.mocked(OrderApi.cancelMyOrder).mockRejectedValue(new Error('Order is not owned by this customer'));
    await expect(executeCustomerAction({ kind: 'cancel_order', orderId: 999 }, context as never)).rejects.toThrow('not owned');
  });
  it('submits the chosen review, refreshes profile/session, and never performs checkout through generic execution', async () => {
    const context = setup();
    jest.mocked(ReviewApi.getEligibility).mockResolvedValue({ canReview: true });
    jest.mocked(ReviewApi.createReview).mockResolvedValue(true as never);
    jest.mocked(UserApi.updateProfile).mockResolvedValue(true as never);
    jest.mocked(AuthApi.logout).mockResolvedValue(true as never);
    await executeCustomerAction({ kind: 'review', productId: 3, rating: 4, content: 'My actual build experience' }, context as never);
    expect(ReviewApi.createReview).toHaveBeenCalledWith({ productId: 3, rating: 4, title: '', content: 'My actual build experience' });
    await executeCustomerAction({ kind: 'update_profile', firstName: 'Lan', address: 'Fixture address' }, context as never);
    expect(UserApi.updateProfile).toHaveBeenCalledWith({ firstName: 'Lan', address: 'Fixture address' });
    await executeCustomerAction({ kind: 'logout' }, context as never);
    expect(context.refreshUser).toHaveBeenCalledTimes(2);
    expect(context.push).toHaveBeenCalledWith('/');
    await expect(executeCustomerAction({ kind: 'checkout' }, context as never)).rejects.toThrow('xác nhận');
    await executeCustomerAction({ kind: 'navigate', path: '/shop' }, context as never);
    expect(context.push).toHaveBeenLastCalledWith('/shop');
  });
  it('returns translated English success and stock errors without changing business behavior', async () => {
    const context = setup();
    context.translate = (key, values = {}) => {
      const message = en.assistantActions[key as keyof typeof en.assistantActions];
      if (typeof message !== 'string') throw new Error(`Missing translation ${key}`);
      return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
    };
    expect(await executeCustomerAction({ kind: 'navigate', path: '/shop' }, context as never)).toBe('Opened the requested page.');
    await expect(executeCustomerAction({ kind: 'cart_add', productId: 3, size: 'M', quantity: 6 }, context as never))
      .rejects.toThrow('Quantity exceeds current stock (5).');
    expect(context.cart.addItem).not.toHaveBeenCalled();
  });
});
