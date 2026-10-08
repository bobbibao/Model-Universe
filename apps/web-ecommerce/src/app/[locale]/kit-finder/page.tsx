import StoreLayout from '@/components/Layouts/StoreLayout';
import KitFinder from '@/core/client/features/shop/pages/KitFinder';
import { getTranslations } from 'next-intl/server';
export async function generateMetadata({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'customerTools' });
  return { title: `${t('finder')} · Model Universe` };
}
export default function Page() { return <StoreLayout><KitFinder /></StoreLayout>; }
