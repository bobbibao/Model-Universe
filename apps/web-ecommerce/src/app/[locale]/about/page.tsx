import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import About from '@/core/client/features/content/pages/About';

export const metadata: Metadata = {
  title: 'Về chúng tôi - Model Universe',
};

const AboutPage = () => {
  return (
    <StoreLayout>
      <About />
    </StoreLayout>
  );
};

export default AboutPage;
