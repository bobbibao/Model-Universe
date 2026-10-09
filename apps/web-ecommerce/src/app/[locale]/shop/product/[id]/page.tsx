import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StoreLayout from '@/components/Layouts/StoreLayout';
import ProductDetail from '@/core/client/features/shop/pages/ProductDetail';
import { getPublicProduct } from '@/shared/server/utils/StorefrontData';

type Props = { params: Promise<{ locale: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params, product = await getPublicProduct(Number(id));
  if (product === null) notFound();
  const t = await getTranslations({ locale, namespace: 'catalog' });
  const description = product && (locale === 'vi' ? product.descriptionVi : product.descriptionEn);
  return { title: `${product?.name || t('title')} | Model Universe`, ...(description ? { description } : {}), alternates: { languages: { vi: `/vi/shop/product/${id}`, en: `/en/shop/product/${id}` } } };
}
export default async function Page({ params }: Props) {
  const { id } = await params, product = await getPublicProduct(Number(id));
  if (product === null) notFound();
  return <StoreLayout><ProductDetail key={id} initialProduct={product} /></StoreLayout>;
}
