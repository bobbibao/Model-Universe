'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ProductApi from '@/core/client/api/Product';
import ProductImage from '@/components/ProductImage';
import PriceTag from '@/components/PriceTag';
import { useComparison } from '@/shared/client/providers/ComparisonProvider';
import type { ProductDetail } from '@/shared/types/product';

export default function CompareModels() {
  const t = useTranslations('catalog'), {ids,toggle,clear} = useComparison();
  const [models,setModels] = useState<ProductDetail[]>([]), [loading,setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    Promise.all(ids.map(id => ProductApi.getProduct(id))).then(results => { if (current) setModels(results.filter((product): product is ProductDetail => !!product)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  },[ids]);
  const fields = ['grade','scale','series','modelCode','condition','assemblyState','boxCondition','includedAccessories','defects','stock'] as const;
  const label = (field:string) => t(({assemblyState:'assembly',boxCondition:'box',includedAccessories:'accessories',stock:'availability'} as Record<string,string>)[field] || field);
  const fact = (model:ProductDetail,field:typeof fields[number]) => {
    const value = model[field];
    if (field === 'condition') return t(value === 'preowned' ? 'preowned' : 'new');
    if (field === 'assemblyState' && typeof value === 'string' && value) return t(value);
    if (field === 'stock') return Number(value) > 0 ? t('availableCount',{count:Number(value)}) : t('soldOut');
    return Array.isArray(value) ? value.join(', ') || t('inspectionRequired') : value || '—';
  };
  return <section className="mu-wrap py-12"><p className="mu-eyebrow">MODEL UNIVERSE / COMPARE</p><h1 className="mu-heading">{t('compare')}</h1><p className="mu-note">{t('compareNote')}</p>
    <div className="my-5 flex gap-4"><Link href="/shop" className="mu-button">{t('backToShop')}</Link>{ids.length > 0 && <button onClick={clear} className="underline">{t('clearCompare')}</button>}</div>
    {loading ? <p role="status" className="mu-note">{t('loadingCompare')}</p> : !models.length ? <p className="mu-panel p-8">{t('emptyCompare')}</p> : <div className="mu-panel overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr><th className="p-4">{t('details')}</th>{models.map(model => <th key={model.id} className="min-w-52 p-5 align-top"><div className="relative mb-4 h-44 w-full"><ProductImage src={model.imageUrl} alt={model.name} sizes="220px" className="object-contain" /></div><Link className="font-bold" href={`/shop/product/${model.id}`}>{model.name}</Link><div className="my-3"><PriceTag price={model.price} salePrice={model.salePrice} discountPercent={model.discountPercent} /></div><button onClick={() => toggle(model.id)} className="mu-note underline">{t('removeCompare')}</button></th>)}</tr></thead><tbody>{fields.map(field => <tr key={field} className="border-t border-stroke"><th className="p-4 text-sm">{label(field)}</th>{models.map(model => <td className="p-4 text-sm" key={model.id}>{fact(model,field)}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}
