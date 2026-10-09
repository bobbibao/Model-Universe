import { Metadata } from 'next';
import ContactMessageList from '@/core/client/features/contact-management/pages/ContactMessageList';

export const metadata: Metadata = {
  title: 'Liên hệ - Quản trị Model Universe',
};

const ContactMessageListPage = () => {
  return (
    <ContactMessageList />
  );
};

export default ContactMessageListPage;
