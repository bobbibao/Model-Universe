import { notFound, permanentRedirect } from 'next/navigation';
import { getPublicProduct } from '@/shared/server/utils/StorefrontData';

type Props = { params: Promise<{ locale: string; id: string }> };

// Older links (/shop/product/<id>, also used by the shopping assistant) move permanently to the SEO path.
export default async function Page({ params }: Props) {
  const { locale, id } = await params,
    product = await getPublicProduct(/^\d+$/.test(id) ? Number(id) : id);
  if (!product?.slug) notFound();
  permanentRedirect(`/${locale === 'en' ? 'en' : 'vi'}/san-pham/${product.slug}`);
}
