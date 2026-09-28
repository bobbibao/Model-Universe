import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import CategoryList from '@/core/client/features/category-management/pages/CategoryList';

export const metadata: Metadata = {
  title: 'Danh mục - Quản trị Clothing Shop',
};

const CategoryListPage = () => {
  return (
    <DefaultLayout>
      <CategoryList />
    </DefaultLayout>
  );
};

export default CategoryListPage;
