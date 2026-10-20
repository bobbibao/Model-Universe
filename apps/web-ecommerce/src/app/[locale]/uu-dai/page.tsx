import StoreLayout from '@/components/Layouts/StoreLayout';
import SaleShelf from '@/core/client/features/sales/SaleShelf';
import PromotionsHub from '@/core/client/features/promotions/PromotionsHub';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Săn ưu đãi mô hình | Model Universe',
  description:
    'Mã giảm giá, freeship, điểm danh, vòng quay may mắn và flash sale mô hình mỗi ngày tại Model Universe.',
};

export default function Page() {
  return (
    <StoreLayout>
      <PromotionsHub />
      <SaleShelf full />
    </StoreLayout>
  );
}
