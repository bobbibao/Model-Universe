import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import StockImport from '@/core/client/features/inventory/pages/StockImport';

export const metadata: Metadata = {
  title: 'Nhập kho - Quản trị Clothing Shop',
};

const StockImportPage = () => {
  return (
    <DefaultLayout>
      <StockImport />
    </DefaultLayout>
  );
};

export default StockImportPage;
