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
      <div className="flex justify-center py-20">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }
  if (products.length === 0) {
    return <p className="py-20 text-center text-lg text-body dark:text-store-muted">{emptyText}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};

export default ProductGrid;
