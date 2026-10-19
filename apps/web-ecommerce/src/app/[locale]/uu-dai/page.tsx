import StoreLayout from '@/components/Layouts/StoreLayout';
import SaleShelf from '@/core/client/features/sales/SaleShelf';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Ưu đãi mô hình | Model Universe', description: 'Ưu đãi mô hình tuyển chọn, sự kiện sale theo tuần và quyền lợi thành viên Model Universe.' };
export default function Page() { return <StoreLayout><SaleShelf full /></StoreLayout>; }
