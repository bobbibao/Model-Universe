import Link from '@/i18n/navigation';
import ProductImage from '@/components/ProductImage';
import PriceTag from '@/components/PriceTag';
import type { ProductSummary } from '@/shared/types/product';
import RatingStars from './RatingStars';
import { useTranslations } from 'next-intl';
import { useComparison } from '@/shared/client/providers/ComparisonProvider';

const ProductCard = ({ product }: { product: ProductSummary }) => {
  const t = useTranslations('catalog');
  const comparison = useComparison();
  const selected = comparison.ids.includes(product.id);
  const href = `/shop/product/${product.id}`;
  return (
    <div className="mu-product group flex flex-col">
      <Link href={href} className="mu-product-photo overflow-hidden">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
          className="object-contain p-5 transition duration-300 group-hover:scale-105"
        />
        {product.stock <= 0 && (
          <span className="absolute left-3 top-3 rounded bg-danger px-2 py-1 text-xs font-semibold text-white">
            {t('soldOut')}
          </span>
        )}
        {product.salesChannel === 'outlet' && (
          <span className="absolute right-3 top-3 rounded bg-black px-2 py-1 text-xs font-semibold text-white">
            Outlet
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-2">{product.grade && <span className="mu-badge">{product.grade}</span>}{product.scale && <span className="mu-badge">{product.scale}</span>}<span className="mu-badge">{t(product.condition === 'preowned' ? 'preowned' : 'new')}</span></div>
        <p className="text-xs font-medium uppercase tracking-wide text-body dark:text-store-muted">
          {product.brandName}
        </p>
        <Link href={href} className="line-clamp-2 font-semibold text-black hover:text-brand-hover dark:text-white">
          {product.name}
        </Link>
        {product.reviewCount > 0 && (
          <span className="flex items-center gap-1 text-sm text-body dark:text-store-muted">
            <RatingStars rating={product.rating} size="sm" />({product.reviewCount})
          </span>
        )}
        <p className="mt-auto">
          <PriceTag price={product.price} salePrice={product.salePrice} discountPercent={product.discountPercent} />
        </p>
        <button className="mt-2 text-left text-xs font-semibold text-brand-hover disabled:opacity-40" aria-pressed={selected} disabled={!selected && comparison.ids.length >= 3} onClick={() => comparison.toggle(product.id)}>{t(selected ? 'selectedCompare' : 'addCompare')}</button>
      </div>
    </div>
  );
};

export default ProductCard;
