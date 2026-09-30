import Link from 'next/link';
import ProductImage from '@/components/ProductImage';
import PriceTag from '@/components/PriceTag';
import type { ProductSummary } from '@/shared/types/product';
import RatingStars from './RatingStars';

const ProductCard = ({ product }: { product: ProductSummary }) => {
  const href = `/shop/product/${product.id}`;
  return (
    <div className="group flex flex-col overflow-hidden rounded-md border border-stroke bg-white shadow-default transition hover:-translate-y-1 dark:border-store-card dark:bg-store-panel">
      <Link href={href} className="relative block aspect-[4/5] overflow-hidden bg-gray-2 dark:bg-store-card">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
        {product.stock <= 0 && (
          <span className="absolute left-3 top-3 rounded bg-danger px-2 py-1 text-xs font-semibold text-white">
            Hết hàng
          </span>
        )}
        {product.salesChannel === 'outlet' && (
          <span className="absolute right-3 top-3 rounded bg-black px-2 py-1 text-xs font-semibold text-white">
            Outlet
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
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
      </div>
    </div>
  );
};

export default ProductCard;
