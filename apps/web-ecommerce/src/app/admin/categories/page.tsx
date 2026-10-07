import { Metadata } from 'next';
import CategoryList from '@/core/client/features/category-management/pages/CategoryList';

export const metadata: Metadata = {
  title: 'Danh mục - Quản trị Clothing Shop',
};

const CategoryListPage = () => {
  return (
    <CategoryList />
  );
};

export default CategoryListPage;
