import { getTranslations } from 'next-intl/server';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Profile from '@/core/client/features/account/pages/Profile';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'profile' });
  return { title: `${t('title')} · Model Universe`, robots: { index: false, follow: false } };
}

const ProfilePage = () => {
  return (
    <StoreLayout>
      <Profile />
    </StoreLayout>
  );
};

export default ProfilePage;
