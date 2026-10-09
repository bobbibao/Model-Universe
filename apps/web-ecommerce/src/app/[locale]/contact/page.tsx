import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Contact from '@/core/client/features/content/pages/Contact';

export const metadata: Metadata = {
  title: 'Liên hệ - Model Universe',
};

const ContactPage = () => {
  return (
    <StoreLayout>
      <Contact />
    </StoreLayout>
  );
};

export default ContactPage;
