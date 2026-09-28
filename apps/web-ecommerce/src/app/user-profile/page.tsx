import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Profile from '@/core/client/features/account/pages/Profile';

export const metadata: Metadata = {
  title: 'Trang cá nhân - Clothing Shop',
};

const ProfilePage = () => {
  return (
    <StoreLayout>
      <Profile />
    </StoreLayout>
  );
};

export default ProfilePage;
