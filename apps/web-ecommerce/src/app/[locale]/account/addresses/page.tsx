import StoreLayout from '@/components/Layouts/StoreLayout';
import AddressBook from '@/core/client/features/account/pages/AddressBook';
import { getTranslations } from 'next-intl/server';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'customerTools' });
  return { title: `${t('addresses')} · Model Universe`, robots: { index: false, follow: false } };
}
export default function Page() { return <StoreLayout><AddressBook /></StoreLayout>; }
