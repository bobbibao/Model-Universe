import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StoreLayout from '@/components/Layouts/StoreLayout';
import Shop from '@/core/client/features/shop/pages/Shop';
import { getPublicCategories } from '@/shared/server/utils/StorefrontData';
import { siteUrl } from '@/shared/server/utils/SiteUrl';

type Props = { params: Promise<{ locale: string; category: string }> };

// A category landing page (/vi/cua-hang/<category>): its own title, description and canonical URL.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category } = await params;
  const found = (await getPublicCategories()).find((row) => row.slug === category);
  if (!found) notFound();
  const t = await getTranslations({ locale, namespace: 'catalog' });
  const path = `/cua-hang/${found.slug}`;
  const description = found.description || t('categoryDescription', { category: found.name });
  return {
    title: `${found.name} | Model Universe`,
    description,
    alternates: {
      canonical: `${siteUrl()}/${locale}${path}`,
      languages: { vi: `${siteUrl()}/vi${path}`, en: `${siteUrl()}/en${path}`, 'x-default': `${siteUrl()}/vi${path}` },
    },
    openGraph: { type: 'website', siteName: 'Model Universe', title: found.name, description },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  return (
    <StoreLayout>
      <Suspense>
        <Shop categorySlug={category} />
      </Suspense>
    </StoreLayout>
  );
}
