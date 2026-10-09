import { Metadata } from 'next';
import CategoryList from '@/core/client/features/category-management/pages/CategoryList';

export const metadata: Metadata = {
  title: 'Danh mục - Quản trị Model Universe',
};

const CategoryListPage = () => {
  return (
    <CategoryList />
  );
};

export default CategoryListPage;
