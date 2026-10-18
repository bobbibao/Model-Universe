import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Shop from '@/core/client/features/shop/pages/Shop';
import { siteUrl } from '@/shared/server/utils/SiteUrl';

type Props = { params: Promise<{ locale: string }> };

// The catalog at its SEO path (/vi/cua-hang); /shop redirects here.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'catalog' });
  return {
    title: `${t('seoTitle')} | Model Universe`,
    description: t('seoDescription'),
    alternates: {
      canonical: `${siteUrl()}/${locale}/cua-hang`,
      languages: { vi: `${siteUrl()}/vi/cua-hang`, en: `${siteUrl()}/en/cua-hang`, 'x-default': `${siteUrl()}/vi/cua-hang` },
    },
    openGraph: { type: 'website', siteName: 'Model Universe', title: t('seoTitle'), description: t('seoDescription') },
  };
}

export default function ShopPage() {
  return (
    <StoreLayout>
      <Suspense>
        <Shop />
      </Suspense>
    </StoreLayout>
  );
}
