import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Contact from '@/core/client/features/content/pages/Contact';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'metadata' });
  return { title: t('contact') };
}

const ContactPage = () => {
  return (
    <StoreLayout>
      <Contact />
    </StoreLayout>
  );
};

export default ContactPage;
