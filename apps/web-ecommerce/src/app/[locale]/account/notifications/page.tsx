import StoreLayout from '@/components/Layouts/StoreLayout';
import CustomerInbox from '@/core/client/features/account/pages/CustomerInbox';
import { getTranslations } from 'next-intl/server';
export async function generateMetadata({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'customerTools' });
  return { title: `${t('inbox')} · Model Universe`, robots: { index: false, follow: false } };
}
export default function Page() { return <StoreLayout><CustomerInbox /></StoreLayout>; }
