'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ProductApi from '@/core/client/api/Product';
import ProductImage from '@/components/ProductImage';
import PriceTag from '@/components/PriceTag';
import AdminIcon from '@/components/Admin/AdminIcon';
import WorkspaceHeader from '@/components/Store/WorkspaceHeader';
import EmptyState from '@/components/Store/EmptyState';
import { useComparison } from '@/shared/client/providers/ComparisonProvider';
import type { ProductDetail } from '@/shared/types/product';

const FIELDS = [
  'grade',
  'scale',
  'series',
  'modelCode',
  'condition',
  'assemblyState',
  'boxCondition',
  'includedAccessories',
  'defects',
  'stock',
] as const;
const LABELS: Record<string, string> = {
  assemblyState: 'assembly',
  boxCondition: 'box',
  includedAccessories: 'accessories',
  stock: 'availability',
};

export default function CompareModels() {
  const t = useTranslations('catalog');
  const common = useTranslations('common');
  const { ids, toggle, clear } = useComparison();
  const [models, setModels] = useState<ProductDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [differencesOnly, setDifferencesOnly] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    Promise.all(ids.map((id) => ProductApi.getProduct(id)))
      .then((results) => {
        if (current) setModels(results.filter((product): product is ProductDetail => !!product));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [ids, retry]);
  const label = (field: string) => t(LABELS[field] || field);
  const fact = (model: ProductDetail, field: (typeof FIELDS)[number]): string => {
    const value = model[field];
    if (field === 'condition') return t(value === 'preowned' ? 'preowned' : 'new');
    if (field === 'assemblyState' && typeof value === 'string' && value) return t(value);
    if (field === 'stock') return Number(value) > 0 ? t('availableCount', { count: Number(value) }) : t('soldOut');
    return Array.isArray(value) ? value.join(', ') || t('inspectionRequired') : String(value || '—');
  };
  const differs = (field: (typeof FIELDS)[number]) =>
    models.length > 1 && models.some((model) => fact(model, field) !== fact(models[0], field));
  const fields = differencesOnly && models.length > 1 ? FIELDS.filter(differs) : FIELDS;
  const missingIds = loading ? [] : ids.filter((id) => !models.some((model) => model.id === id));
  return (
    <section className="mu-wrap store-workspace compare-workspace">
      <WorkspaceHeader
        title={t('compare')}
        description={t('selectedModels', { count: ids.length })}
        icon="exchange"
        actions={
          <>
            <Link href="/shop" className="store-text-link">
              {t('backToShop')}
              <AdminIcon name="arrow" size={16} />
            </Link>
            {ids.length > 0 && (
              <button onClick={clear} className="mu-button-secondary compare-clear">
                <AdminIcon name="close" size={14} />
                {t('clearCompare')}
              </button>
            )}
          </>
        }
      />
      {missingIds.length > 0 && (
        <div className="compare-load-warning" role="alert">
          <p>{t('missingCompare', { count: missingIds.length })}</p>
          <div>
            <button onClick={() => setRetry((current) => current + 1)}>{common('retry')}</button>
            <button onClick={() => missingIds.forEach(toggle)}>{t('removeUnavailableCompare')}</button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="compare-loading" role="status">
          <p>{t('loadingCompare')}</p>
          <div className="compare-loading-cards" aria-hidden="true">
            {ids.map((id) => (
              <div className="catalog-product-skeleton" key={id}>
                <div className="catalog-skeleton-photo" />
                <div className="catalog-skeleton-copy">
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !models.length ? (
        <EmptyState icon="exchange" title={t('emptyCompareTitle')} description={t('emptyCompare')}>
          <Link href="/shop" className="mu-button">
            {t('backToShop')}
            <AdminIcon name="arrow" size={16} />
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="compare-toolbar">
            <label className="compare-differences-toggle">
              <input
                type="checkbox"
                checked={differencesOnly}
                disabled={models.length < 2}
                onChange={(event) => setDifferencesOnly(event.target.checked)}
              />
              {t('differencesOnly')}
            </label>
            {ids.length < 3 && (
              <Link href="/shop" className="store-text-link">
                <span aria-hidden="true">+</span>
                {t('addCompareModel')}
              </Link>
            )}
            <p>{t(models.length < 2 ? 'compareOneMore' : 'differenceHint')}</p>
          </div>
          <div
            className="compare-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t('compare')}
            style={{ '--compare-count': models.length } as CSSProperties}
          >
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col" className="compare-feature-column">
                    <span className="compare-table-label">{t('details')}</span>
                    <p>{t('compareScrollHint')}</p>
                  </th>
                  {models.map((model) => (
                    <th key={model.id} scope="col" className="compare-product-column">
                      <div className="compare-product-photo">
                        <ProductImage src={model.imageUrl} alt={model.name} sizes="160px" className="object-contain" />
                        <button
                          aria-label={t('removeCompareNamed', { name: model.name })}
                          onClick={() => toggle(model.id)}
                        >
                          <AdminIcon name="close" size={16} />
                        </button>
                      </div>
                      <p className="compare-product-brand">{model.brandName}</p>
                      <Link className="compare-product-name" href={`/shop/product/${model.id}`}>
                        {model.name}
                      </Link>
                      <div className="compare-product-price">
                        <PriceTag
                          price={model.price}
                          salePrice={model.salePrice}
                          discountPercent={model.discountPercent}
                          className="text-base"
                        />
                      </div>
                      <Link className="compare-product-details" href={`/shop/product/${model.id}`}>
                        {common('details')}
                        <AdminIcon name="arrow" size={14} />
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field} className={differs(field) ? 'compare-row-difference' : ''}>
                    <th scope="row">
                      {label(field)}
                      {differs(field) && <span className="compare-difference-dot" aria-label={t('differentValues')} />}
                    </th>
                    {models.map((model) => (
                      <td
                        key={model.id}
                        className={
                          field === 'stock'
                            ? model.stock > 0
                              ? 'compare-stock-available'
                              : 'compare-stock-unavailable'
                            : ''
                        }
                      >
                        {fact(model, field)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {fields.length === 0 && (
              <p className="compare-no-differences" role="status">
                {t('noDifferences')}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
