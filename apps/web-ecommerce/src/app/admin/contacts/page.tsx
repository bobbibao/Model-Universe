import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import ContactMessageList from '@/core/client/features/contact-management/pages/ContactMessageList';

export const metadata: Metadata = {
  title: 'Liên hệ - Quản trị Clothing Shop',
};

const ContactMessageListPage = () => {
  return (
    <DefaultLayout>
      <ContactMessageList />
    </DefaultLayout>
  );
};

export default ContactMessageListPage;
