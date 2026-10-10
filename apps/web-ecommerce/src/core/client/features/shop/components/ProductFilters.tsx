'use client';
import { useLocale, useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ASSEMBLY_STATES, GRADES } from '@/shared/gunpla';
import { formatVND } from '@/shared/server/utils/utils';
import type { Category, ProductSort } from '@/shared/types/product';
export interface ProductFilterValues {
  assemblyState?: string;
  q: string;
  category: string;
  gender: string;
  grade: string;
  scale: string;
  series: string;
  condition: string;
  brand: string;
  minPrice: number;
  maxPrice?: number;
  inStock: boolean;
  outletOnly: boolean;
  sort: ProductSort | '';
}
export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  'newest',
  'price_asc',
  'price_desc',
  'name',
  'best_selling',
  'rating',
].map((value) => ({ value: value as ProductSort, label: value }));
interface Props {
  values: ProductFilterValues;
  categories: Category[];
  brands: string[];
  priceLimit: number;
  onChange: (values: ProductFilterValues) => void;
  onSubmit: () => void;
  onReset: () => void;
}
export default function ProductFilters({
  values: draft,
  categories,
  brands,
  priceLimit,
  onChange,
  onSubmit,
  onReset,
}: Props) {
  const values = { ...draft, maxPrice: draft.maxPrice ?? priceLimit };
  const t = useTranslations('catalog');
  const locale = useLocale();
  const [priceInputs, setPriceInputs] = useState({
    minPrice: String(values.minPrice),
    maxPrice: String(values.maxPrice),
  });
  useEffect(() => {
    setPriceInputs({ minPrice: String(values.minPrice), maxPrice: String(values.maxPrice) });
  }, [values.minPrice, values.maxPrice]);
  const appliedParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(
      ['scale', 'condition', 'assemblyState', 'category', 'brand', 'series', 'minPrice', 'maxPrice'].some((key) =>
        appliedParams.has(key),
      ),
    );
  }, [appliedParams]);
  const update = <K extends keyof ProductFilterValues>(key: K, value: ProductFilterValues[K]) =>
    onChange({ ...draft, [key]: value });
  const price = (field: 'minPrice' | 'maxPrice', value: number) => {
    const bounded = Math.max(0, Math.min(priceLimit, Math.round(value)));
    const next = field === 'minPrice' ? Math.min(bounded, values.maxPrice) : Math.max(bounded, values.minPrice);
    update(field, next);
    return next;
  };
  const typePrice = (field: 'minPrice' | 'maxPrice', text: string) => {
    setPriceInputs((current) => ({ ...current, [field]: text }));
    const number = Number(text);
    if (
      text !== '' &&
      Number.isSafeInteger(number) &&
      number >= 0 &&
      number <= priceLimit &&
      (field === 'minPrice' ? number <= values.maxPrice : number >= values.minPrice)
    )
      update(field, number);
  };
  const finishPrice = (field: 'minPrice' | 'maxPrice') => {
    const next = price(field, Number(priceInputs[field]));
    setPriceInputs((current) => ({ ...current, [field]: String(next) }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const extraCount = [
    values.scale,
    values.condition,
    values.assemblyState,
    values.category,
    values.brand,
    values.series,
    values.minPrice > 0 || values.maxPrice < priceLimit,
  ].filter(Boolean).length;
  const select = (
    field: 'scale' | 'condition' | 'brand' | 'category' | 'assemblyState',
    options: { value: string; label: string }[],
  ) => (
    <div key={field}>
      <label className="mu-field" htmlFor={`filter-${field}`}>
        {t(field === 'assemblyState' ? 'assembly' : field)}
      </label>
      <select
        className="mu-input"
        id={`filter-${field}`}
        value={values[field] || ''}
        onChange={(event) => update(field, event.target.value)}
      >
        <option value="">{t('all')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <form className="mu-filter catalog-filters" role="search" onSubmit={submit}>
      <div className="catalog-search-row">
        <div className="catalog-search-input">
          <AdminIcon name="search" size={20} />
          <label className="sr-only" htmlFor="filter-q">
            {t('search')}
          </label>
          <input
            type="search"
            id="filter-q"
            className="mu-input"
            placeholder={t('search')}
            value={values.q}
            onChange={(event) => update('q', event.target.value)}
          />
        </div>
        <div className="catalog-sort">
          <label className="sr-only" htmlFor="filter-sort">
            {t('sort')}
          </label>
          <select
            id="filter-sort"
            className="mu-input"
            value={values.sort}
            onChange={(event) => update('sort', event.target.value as ProductSort)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.value)}
              </option>
            ))}
          </select>
        </div>
        <button className="mu-button" type="submit">
          {t('apply')} <AdminIcon name="arrow" size={16} />
        </button>
      </div>
      <div className="catalog-quick-row">
        <fieldset className="catalog-grade-pills">
          <legend className="sr-only">{t('grade')}</legend>
          {['', ...GRADES].map((grade) => (
            <label key={grade || 'all'}>
              <input
                type="radio"
                name="grade"
                value={grade}
                checked={values.grade === grade}
                onChange={() => update('grade', grade)}
              />
              <span>{grade || t('allGrades')}</span>
            </label>
          ))}
        </fieldset>
        <label className="catalog-stock-toggle">
          <input
            type="checkbox"
            checked={values.inStock}
            onChange={(event) => update('inStock', event.target.checked)}
          />
          <span>{t('inStock')}</span>
        </label>
      </div>
      <details
        className="studio-filter-more catalog-filter-more"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>
          <AdminIcon name="chart" size={17} />
          <span>{t('refine')}</span>
          {extraCount > 0 && <span className="catalog-filter-count">{extraCount}</span>}
          <span className="catalog-filter-hint">{t('refineHint')}</span>
        </summary>
        <div className="catalog-filter-grid">
          {select(
            'scale',
            ['1/144', '1/100', '1/60', 'non-scale'].map((value) => ({ value, label: value })),
          )}
          {select(
            'condition',
            ['new', 'preowned'].map((value) => ({ value, label: t(value) })),
          )}
          {select(
            'assemblyState',
            ASSEMBLY_STATES.map((value) => ({ value, label: t(value) })),
          )}
          {select(
            'category',
            categories.map((category) => ({ value: category.slug, label: category.name })),
          )}
          {select(
            'brand',
            brands.map((value) => ({ value, label: value })),
          )}
          <div>
            <label className="mu-field" htmlFor="filter-series">
              {t('series')}
            </label>
            <input
              className="mu-input"
              id="filter-series"
              value={values.series}
              onChange={(event) => update('series', event.target.value)}
            />
          </div>
          <fieldset className="catalog-price-range">
            <legend>{t('priceRange')}</legend>
            <output>
              {formatVND(values.minPrice, locale)} <span>—</span> {formatVND(values.maxPrice, locale)}
            </output>
            <div
              className="catalog-range-track"
              style={
                {
                  '--range-start': `${priceLimit ? (values.minPrice / priceLimit) * 100 : 0}%`,
                  '--range-end': `${priceLimit ? (values.maxPrice / priceLimit) * 100 : 100}%`,
                } as CSSProperties
              }
            >
              <input
                aria-label={t('minPrice')}
                id="filter-min-price"
                type="range"
                min="0"
                max={priceLimit}
                step="1"
                value={values.minPrice}
                disabled={!priceLimit}
                onChange={(event) => price('minPrice', Number(event.target.value))}
                aria-valuetext={formatVND(values.minPrice, locale)}
                aria-valuemax={values.maxPrice}
                style={{ zIndex: values.minPrice > priceLimit / 2 ? 3 : 2 }}
              />
              <input
                aria-label={t('maxPrice')}
                id="filter-price"
                type="range"
                min="0"
                max={priceLimit}
                step="1"
                value={values.maxPrice}
                disabled={!priceLimit}
                onChange={(event) => price('maxPrice', Number(event.target.value))}
                aria-valuetext={formatVND(values.maxPrice, locale)}
                aria-valuemin={values.minPrice}
              />
            </div>
            <div className="catalog-price-inputs">
              <label htmlFor="filter-min-price-input">
                {t('minPrice')}
                <input
                  id="filter-min-price-input"
                  type="number"
                  min="0"
                  max={values.maxPrice}
                  step="1"
                  disabled={!priceLimit}
                  value={priceInputs.minPrice}
                  onChange={(event) => typePrice('minPrice', event.target.value)}
                  onBlur={() => finishPrice('minPrice')}
                />
              </label>
              <span aria-hidden="true">→</span>
              <label htmlFor="filter-max-price-input">
                {t('maxPrice')}
                <input
                  id="filter-max-price-input"
                  type="number"
                  min={values.minPrice}
                  max={priceLimit}
                  step="1"
                  disabled={!priceLimit}
                  value={priceInputs.maxPrice}
                  onChange={(event) => typePrice('maxPrice', event.target.value)}
                  onBlur={() => finishPrice('maxPrice')}
                />
              </label>
            </div>
          </fieldset>
        </div>
      </details>
      <div className="catalog-filter-footer">
        <p>{t('applyHint')}</p>
        <button type="button" onClick={onReset}>
          {t('reset')} <AdminIcon name="close" size={14} />
        </button>
      </div>
    </form>
  );
}
