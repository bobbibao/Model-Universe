import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Wishlist from '@/core/client/features/account/pages/Wishlist';

export const metadata: Metadata = {
  title: 'Danh sách yêu thích - Model Universe',
};

const WishlistPage = () => {
  return (
    <StoreLayout>
      <Wishlist />
    </StoreLayout>
  );
};

export default WishlistPage;
