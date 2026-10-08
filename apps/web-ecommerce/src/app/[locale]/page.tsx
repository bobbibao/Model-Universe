import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Home from '@/core/client/features/home/pages/Home';
import { getTranslations } from 'next-intl/server';
import { getFeaturedProducts } from '@/shared/server/utils/StorefrontData';

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'metadata' });
  return { title: t('home'), description: t('description'), alternates: { languages: { vi: '/vi', en: '/en' } } };
}

export default async function HomePage() {
  const initialProducts = await getFeaturedProducts();
  return (
    <StoreLayout>
      <Home initialProducts={initialProducts} />
    </StoreLayout>
  );
}
