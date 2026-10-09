import { getTranslations } from 'next-intl/server';
import StoreLayout from '@/components/Layouts/StoreLayout';
import CollectorServices from '@/core/client/features/content/pages/CollectorServices';

export async function generateMetadata() {
  const t=await getTranslations('services');
  return { title:`${t('title')} | Model Universe`, description:t('subtitle') };
}
export default function ServicesPage() { return <StoreLayout><CollectorServices /></StoreLayout>; }
