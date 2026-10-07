import { Metadata } from 'next';
import StockImport from '@/core/client/features/inventory/pages/StockImport';

export const metadata: Metadata = {
  title: 'Nhập kho - Quản trị Clothing Shop',
};

const StockImportPage = () => {
  return (
    <StockImport />
  );
};

export default StockImportPage;
