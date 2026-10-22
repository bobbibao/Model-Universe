import { getTranslations } from 'next-intl/server';
import StoreLayout from '@/components/Layouts/StoreLayout';
import { getFeaturedProducts } from '@/shared/server/utils/StorefrontData';
import CollectorServices from '@/core/client/features/content/pages/CollectorServices';

export async function generateMetadata() {
  const t = await getTranslations('services');
  return { title: `${t('title')} | Model Universe`, description: t('subtitle') };
}
export default async function ServicesPage() {
  const featured = await getFeaturedProducts();
  return (
    <StoreLayout>
      <CollectorServices product={featured?.find((product) => product.stock > 0)} />
    </StoreLayout>
  );
}
