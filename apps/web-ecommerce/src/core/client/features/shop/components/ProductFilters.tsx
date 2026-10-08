'use client';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { GRADES } from '@/shared/gunpla';
import { formatVND } from '@/shared/server/utils/utils';
import type { Category, ProductSort } from '@/shared/types/product';
export interface ProductFilterValues {
 q: string; category: string; gender: string; grade: string; scale: string; series: string; condition: string;
 brand: string; maxPrice: number; inStock: boolean; outletOnly: boolean; sort: ProductSort | '';
}
export const SORT_OPTIONS: {value: ProductSort;label:string}[] = ['newest','price_asc','price_desc','name','best_selling','rating'].map(value=>({value:value as ProductSort,label:value}));
interface Props {
 values:ProductFilterValues; categories:Category[]; brands:string[]; priceLimit:number;
 onChange:(values:ProductFilterValues)=>void; onSubmit:()=>void; onReset:()=>void;
}
export default function ProductFilters({values,categories,brands,priceLimit,onChange,onSubmit,onReset}:Props) {
 const t=useTranslations('catalog');
 const update=<K extends keyof ProductFilterValues>(key:K,value:ProductFilterValues[K])=>onChange({...values,[key]:value});
 const submit=(event:FormEvent)=>{event.preventDefault();onSubmit();};
 const select=(field:'grade'|'scale'|'condition'|'brand'|'category',options:{value:string;label:string}[])=> <div key={field}><label className="mu-field" htmlFor={`filter-${field}`}>{t(field)}</label><select className="mu-input" id={`filter-${field}`} value={values[field]} onChange={event=>update(field,event.target.value)}><option value="">{t('all')}</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
 return <form className="mu-filter" onSubmit={submit}>
  <div><label className="mu-field" htmlFor="filter-q">{t('search')}</label><input id="filter-q" className="mu-input" value={values.q} onChange={event=>update('q',event.target.value)}/></div>
  {select('grade',GRADES.map(value=>({value,label:value})))}
  {select('scale',['1/144','1/100','1/60','non-scale'].map(value=>({value,label:value})))}
  {select('condition',['new','preowned'].map(value=>({value,label:t(value)})))}
  {select('category',categories.map(category=>({value:category.slug,label:category.name})))}
  {select('brand',brands.map(value=>({value,label:value})))}
  <div><label className="mu-field" htmlFor="filter-series">{t('series')}</label><input className="mu-input" id="filter-series" value={values.series} onChange={event=>update('series',event.target.value)}/></div>
  <div><label className="mu-field" htmlFor="filter-sort">{t('sort')}</label><select id="filter-sort" className="mu-input" value={values.sort} onChange={event=>update('sort',event.target.value as ProductSort)}>{SORT_OPTIONS.map(option=><option key={option.value} value={option.value}>{t(option.value)}</option>)}</select></div>
  <div className="sm:col-span-2"><label className="mu-field" htmlFor="filter-price">{t('maxPrice')}: {formatVND(values.maxPrice)}</label><input id="filter-price" className="w-full accent-brand-hover" type="range" min="0" max={priceLimit} step="50000" value={values.maxPrice} onChange={event=>update('maxPrice',Number(event.target.value))}/></div>
  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={values.inStock} onChange={event=>update('inStock',event.target.checked)} className="accent-brand-hover"/>{t('inStock')}</label>
  <div className="flex flex-wrap gap-3"><button className="mu-button" type="submit">{t('apply')}</button><button className="text-sm underline" type="button" onClick={onReset}>{t('reset')}</button></div>
 </form>;
}
