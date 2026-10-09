import { Metadata } from 'next';
import StoreLayout from '@/components/Layouts/StoreLayout';
import About from '@/core/client/features/content/pages/About';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'metadata' });
  return { title: t('about') };
}

const AboutPage = () => {
  return (
    <StoreLayout>
      <About />
    </StoreLayout>
  );
};

export default AboutPage;
