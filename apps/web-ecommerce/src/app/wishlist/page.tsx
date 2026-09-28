import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Wishlist from '@/core/client/features/account/pages/Wishlist';

export const metadata: Metadata = {
  title: 'Danh sách yêu thích - Clothing Shop',
};

const WishlistPage = () => {
  return (
    <StoreLayout>
      <Wishlist />
    </StoreLayout>
  );
};

export default WishlistPage;
