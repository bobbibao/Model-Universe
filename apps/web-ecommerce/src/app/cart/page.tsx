import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Cart from '@/core/client/features/cart/pages/Cart';

export const metadata: Metadata = {
  title: 'Giỏ hàng - Clothing Shop',
};

const CartPage = () => {
  return (
    <StoreLayout>
      <Cart />
    </StoreLayout>
  );
};

export default CartPage;
