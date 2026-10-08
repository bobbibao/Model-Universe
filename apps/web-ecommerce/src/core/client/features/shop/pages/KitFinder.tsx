'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ProductApi from '@/core/client/api/Product';
import ProductGrid from '../components/ProductGrid';
import type { ProductSummary } from '@/shared/types/product';
import { ASSEMBLY_STATES, GRADES } from '@/shared/gunpla';

export default function KitFinder() {
  const t = useTranslations('customerTools'), catalog = useTranslations('catalog'), common = useTranslations('common');
  const [rows, setRows] = useState<ProductSummary[]>([]), [total, setTotal] = useState(0), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false), [failed, setFailed] = useState(false);
  const [shopLink, setShopLink] = useState('/shop');
  const request = useRef(0);
  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const query = Object.fromEntries(['grade', 'assemblyState', 'condition', 'maxPrice'].map(key => [key, String(form.get(key) || '')]).filter(([, value]) => value));
    const number = ++request.current; setBusy(true); setFailed(false);
    const result = await ProductApi.getProducts({ ...query, inStock: true, maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined, per_page: 12, page: 1 });
    if (number !== request.current) return;
    setBusy(false); setSearched(true); setFailed(!result); setRows(result?.data || []); setTotal(result?.pagination.total || 0);
    setShopLink(`/shop?${new URLSearchParams({ ...query, inStock: 'true' }).toString()}`);
  };
  return <section className="mu-wrap mu-section"><p className="mu-eyebrow">MODEL UNIVERSE / DISCOVERY</p><h1 className="mu-heading">{t('finder')}</h1><p className="mu-note mt-4 max-w-3xl">{t('finderIntro')}</p>
    <form className="mu-panel my-8 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('finderForm')} onSubmit={event => void search(event)}>
      <label className="mu-field">{catalog('grade')}<select name="grade" defaultValue=""><option value="">{t('any')}</option>{GRADES.map(grade => <option key={grade}>{grade}</option>)}</select></label>
      <label className="mu-field">{catalog('assembly')}<select name="assemblyState" defaultValue="unassembled">{ASSEMBLY_STATES.map(state => <option key={state} value={state}>{catalog(state)}</option>)}</select></label>
      <label className="mu-field">{catalog('condition')}<select name="condition" defaultValue="new"><option value="">{t('any')}</option><option value="new">{catalog('new')}</option><option value="preowned">{catalog('preowned')}</option></select></label>
      <label className="mu-field">{t('budget')}<input type="number" name="maxPrice" step="1" min="1" max="2147483647" placeholder={t('any')} /></label>
      <button className="mu-button sm:col-span-2 lg:col-span-4" disabled={busy}>{busy ? common('loading') : t('findModels')}</button>
    </form>
    <p className="mu-note mb-6">{t('finderNote')}</p>
    {searched && !failed && <p className="mb-4 font-semibold" role="status">{t('matches', { count: total })}</p>}
    {failed ? <p className="mu-note" role="alert">{t('searchFailed')}</p> : searched && <><ProductGrid products={rows} loading={busy} emptyText={t('noMatches')} />{total > 12 && <Link className="mu-button mt-6" href={shopLink}>{t('allMatches')}</Link>}</>}
  </section>;
}
