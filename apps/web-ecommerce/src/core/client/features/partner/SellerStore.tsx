'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import ProductCard from '@/core/client/features/shop/components/ProductCard';
import type { ProductSummary } from '@/shared/types/product';

interface Store { id: number; displayName: string; products: { rows: ProductSummary[]; count: number } }
export default function SellerStore() {
  const t = useTranslations('sellerStore'), common = useTranslations('common'), { id } = useParams<{ id: string }>();
  const [store, setStore] = useState<Store | null>(null), [offset, setOffset] = useState(0), [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoaded(false); setStore(null); setFailed(false);
    try {
      const result = (await Api.get(`/sellers/${id}`, { params: { offset } })).data;
      if (request.current === current) setStore(result);
    }
    catch { if (request.current === current) setFailed(true); }
    finally { if (request.current === current) setLoaded(true); }
  }, [id, offset]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  return <section className="mu-wrap mu-section"><p className="mu-eyebrow">MODEL UNIVERSE / MARKETPLACE</p>
    <h1 className="mu-heading break-words">{store?.displayName || t('title')}</h1>
    {!loaded && <p role="status" className="mu-note">{common('loading')}</p>}
    {failed && <div role="alert" className="mu-panel mt-6 space-y-4 p-6"><p>{t('unavailable')}</p><button className="mu-button" onClick={() => void load()}>{common('retry')}</button></div>}
    {store && <><div className="mu-panel mt-6 space-y-3 p-5"><p className="font-semibold">{t('verified')}</p><p className="mu-note">{t('verificationNote')}</p><p className="mu-note">{t('separateSeller')}</p></div>
      <h2 className="mt-8 text-2xl font-bold">{t('listings', { count: store.products.count })}</h2>
      {store.products.rows.length === 0 ? <p className="mu-note">{t('empty')}</p> : <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{store.products.rows.map(product => <ProductCard key={product.id} product={product} />)}</div>}
      {store.products.count > 12 && <div className="mt-6 flex gap-3"><button className="mu-button mu-button-secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))}>{common('previous')}</button><button className="mu-button mu-button-secondary" disabled={offset + 12 >= store.products.count} onClick={() => setOffset(offset + 12)}>{common('next')}</button></div>}
    </>}
  </section>;
}
