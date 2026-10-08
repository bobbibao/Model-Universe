import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Cart from '@/core/client/features/cart/pages/Cart';

export const metadata: Metadata = {
  title: 'Giỏ hàng - Model Universe',
};

const CartPage = () => {
  return (
    <StoreLayout>
      <Cart />
    </StoreLayout>
  );
};

export default CartPage;
