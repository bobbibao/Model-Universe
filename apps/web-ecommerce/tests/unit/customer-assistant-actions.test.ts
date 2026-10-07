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
import { executeCustomerAction } from '../../src/core/client/features/assistant/executeCustomerAction';

const product = { id: 3, name: 'Giày', stock: 5, availableSizes: ['M', 'L'], price: 700000, salePrice: 600000 };
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
});
