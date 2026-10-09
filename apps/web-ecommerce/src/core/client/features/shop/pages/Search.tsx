'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import ProductApi from '@/core/client/api/Product';
import type { Pagination } from '@/shared/types/pagination';
import type { ProductSummary } from '@/shared/types/product';
import ProductGrid from '../components/ProductGrid';
import StorePagination from '../components/StorePagination';

const PAGE_SIZE = 12;

const Search = () => {
  const router = useRouter();
  const t = useTranslations('searchPage');
  const common = useTranslations('common');
  const searchParams = useSearchParams();
  const term = searchParams.get('q')?.trim() || '';
  const requestedPage = Number(searchParams.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const [input, setInput] = useState(term);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(Boolean(term));
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setInput(term);
    setProducts([]);
    setPagination(undefined);
    setFailed(false);
    setLoading(Boolean(term));
    if (!term) return;
    let cancelled = false;
    const load = async () => {
      const result = await ProductApi.getProducts({ q: term, page, per_page: PAGE_SIZE });
      if (cancelled) return;
      setFailed(!result);
      setProducts(result?.data || []);
      setPagination(result?.pagination);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [term, page, retry]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = input.trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  return (
    <section className="mu-wrap mu-section">
      <h1 className="mu-heading mb-4">{t('title')}</h1>
      <p className="mu-note mb-8 max-w-2xl">{t('intro')}</p>
      <form role="search" onSubmit={handleSubmit} className="mb-8 flex max-w-2xl gap-3">
        <label htmlFor="catalog-query" className="sr-only">{t('query')}</label>
        <input
          id="catalog-query"
          type="search"
          className="mu-input min-w-0 flex-1"
          placeholder={t('placeholder')}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className="mu-button">
          {t('submit')}
        </button>
      </form>

      {!term ? (
        <div className="mu-panel p-6">
          <p className="mb-5 text-store-muted">{t('start')}</p>
          <div className="flex flex-wrap gap-3">
            {['HG', 'RG', 'MG', 'PG'].map(grade => <Link key={grade} href={`/shop?grade=${grade}`} className="mu-button mu-button-secondary">{grade}</Link>)}
            <Link href="/kit-finder" className="mu-button mu-button-secondary">{t('finder')}</Link>
          </div>
        </div>
      ) : (
        <div aria-busy={loading}>
          {loading ? <p role="status" aria-live="polite">{common('loading')}</p> : failed ? (
            <div role="alert" className="mu-panel p-6">
              <p className="mb-4">{t('failed')}</p>
              <button type="button" className="mu-button mu-button-secondary" onClick={() => setRetry(value => value + 1)}>{common('retry')}</button>
            </div>
          ) : <p role="status" aria-live="polite" className="mb-6">{t('results', { count: pagination?.total ?? products.length, term })}</p>}
          {!failed && <ProductGrid products={products} loading={loading} emptyText={t('empty')} />}
          {!failed &&
          <StorePagination
            pagination={pagination}
            onPageChange={(nextPage) => {
              router.push(`/search?q=${encodeURIComponent(term)}&page=${nextPage}`);
              window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            }}
          />}
        </div>
      )}
    </section>
  );
};

export default Search;
