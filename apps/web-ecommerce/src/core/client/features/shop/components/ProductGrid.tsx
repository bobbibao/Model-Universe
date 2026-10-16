import type { ProductSummary } from '@/shared/types/product';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: ProductSummary[];
  loading?: boolean;
  emptyText?: string;
}

const ProductGrid = ({ products, loading = false, emptyText = 'No models found.' }: ProductGridProps) => {
  if (loading) {
    return (
      <div
        className="catalog-product-grid grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="catalog-product-skeleton">
            <div className="catalog-skeleton-photo" />
            <div className="catalog-skeleton-copy">
              <span />
              <span />
              <span />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (products.length === 0) {
    return <p className="py-20 text-center text-lg text-body dark:text-store-muted">{emptyText}</p>;
  }
  return (
    <div className="catalog-product-grid grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};

export default ProductGrid;
