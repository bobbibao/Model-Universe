import StoreLayout from '@/components/Layouts/StoreLayout';
import SellerStore from '@/core/client/features/partner/SellerStore';
import { getTranslations } from 'next-intl/server';
export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'sellerStore' });
  return { title: `${t('title')} | Model Universe`, robots: { index: false, follow: true } };
}
export default function Page() { return <StoreLayout><SellerStore /></StoreLayout>; }
