import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import Settings from '@/core/client/features/agent-console/pages/Settings';

export const metadata: Metadata = {
  title: 'Cài đặt tác tử - Quản trị Clothing Shop',
};

const SettingsPage = () => {
  return (
    <DefaultLayout>
      <Settings />
    </DefaultLayout>
  );
};

export default SettingsPage;
