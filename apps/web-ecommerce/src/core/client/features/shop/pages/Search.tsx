'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductApi from '@/core/client/api/Product';
import type { Pagination } from '@/shared/types/pagination';
import type { ProductSummary } from '@/shared/types/product';
import ProductGrid from '../components/ProductGrid';
import StorePagination from '../components/StorePagination';

const PAGE_SIZE = 12;

const Search = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const term = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [input, setInput] = useState(term);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(term);
    if (!term) {
      setProducts([]);
      setPagination(undefined);
      return;
    }
    const load = async () => {
      setLoading(true);
      const result = await ProductApi.getProducts({ q: term, page, per_page: PAGE_SIZE });
      setProducts(result?.data || []);
      setPagination(result?.pagination);
      setLoading(false);
    };
    load();
  }, [term, page]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = input.trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <form onSubmit={handleSubmit} className="mx-auto mb-10 flex max-w-2xl gap-3">
        <input
          className="w-full rounded-md border-[1.5px] border-stroke bg-transparent px-5 py-4 text-lg text-black outline-none focus:border-brand-hover dark:border-store-card dark:text-white"
          placeholder="Tìm kiếm..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoFocus
        />
        <button type="submit" className="rounded-md bg-brand px-6 font-semibold text-brand-ink hover:bg-brand-hover">
          Tìm
        </button>
      </form>

      {term && !loading && (
        <p className="mb-6 text-lg">
          {products.length > 0 ? (
            <>
              Kết quả tìm kiếm cho &quot;<span className="font-semibold">{term}</span>&quot; ({pagination?.total})
            </>
          ) : (
            <>
              Không tìm thấy kết quả cho &quot;<span className="font-semibold">{term}</span>&quot;
            </>
          )}
        </p>
      )}
      {term && (
        <>
          <ProductGrid products={products} loading={loading} emptyText="Hãy thử từ khoá khác." />
          <StorePagination
            pagination={pagination}
            onPageChange={(nextPage) => {
              router.push(`/search?q=${encodeURIComponent(term)}&page=${nextPage}`);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}
    </div>
  );
};

export default Search;
