import { Suspense } from 'react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Search from '@/core/client/features/shop/pages/Search';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'searchPage' });
  return { title: `${t('title')} | Model Universe` };
}

const SearchPage = () => {
  return (
    <StoreLayout>
      <Suspense>
        <Search />
      </Suspense>
    </StoreLayout>
  );
};

export default SearchPage;
