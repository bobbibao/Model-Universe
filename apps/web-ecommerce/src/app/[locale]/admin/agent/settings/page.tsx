import { Metadata } from 'next';
import Settings from '@/core/client/features/agent-console/pages/Settings';

export const metadata: Metadata = {
  title: 'Cài đặt Agent - Quản trị Model Universe',
};

const SettingsPage = () => {
  return (
    <Settings />
  );
};

export default SettingsPage;
