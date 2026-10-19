'use client';
/* eslint-disable @next/next/no-img-element -- catalog and uploaded thumbnails are displayed directly */

import { useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import type { MarketingOptions } from '@/shared/types/admin-marketing';
import { MAX_MARKETING_IMAGES, MAX_MARKETING_PRODUCTS, type MarketingMediaOption } from '@/shared/marketing-selection';

const searchKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

export function MarketingProductPicker({
  products,
  selected,
  onChange,
}: {
  products: MarketingOptions['products'];
  selected: string[];
  onChange: (skus: string[]) => void;
}) {
  const t = useTranslations('marketingStudio.selection');
  const locale = useLocale();
  const id = useId();
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const matches = products.filter(
    (product) =>
      (!onlySelected || selected.includes(product.sku)) &&
      searchKey(`${product.name} ${product.sku}`).includes(searchKey(query.trim())),
  );
  const suggestions = ['HG', 'RG', 'MG', 'SD'].filter((grade) =>
    products.some((product) => new RegExp(`\\b${grade}\\b`, 'i').test(`${product.name} ${product.sku}`)),
  );
  return (
    <section className="mk-selection" aria-labelledby={`${id}-label`}>
      <div className="mk-selection-heading">
        <div>
          <span className="mk-step">01</span>
          <h3 id={`${id}-label`}>{t('products')}</h3>
        </div>
        <span className="mk-selection-count">
          {selected.length}/{MAX_MARKETING_PRODUCTS}
        </span>
      </div>
      <p className="mk-hint">{t('productsHint')}</p>
      <div className="mk-picker-search">
        <AdminIcon name="search" size={17} />
        <input
          id={id}
          type="search"
          aria-label={t('searchProducts')}
          placeholder={t('searchProducts')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="mk-picker-tools">
        <div className="mk-filter-chips">
          <button
            type="button"
            className={onlySelected ? 'is-selected' : ''}
            aria-pressed={onlySelected}
            onClick={() => setOnlySelected(!onlySelected)}
          >
            {t('selectedProducts', { count: selected.length })}
          </button>
          {suggestions.map((grade) => (
            <button
              type="button"
              key={grade}
              className={query === grade ? 'is-selected' : ''}
              onClick={() => {
                setQuery(query === grade ? '' : grade);
                setOnlySelected(false);
              }}
            >
              {grade}
            </button>
          ))}
        </div>
        {selected.length > 0 && (
          <button type="button" className="mk-link" onClick={() => onChange([])}>
            {t('clear')}
          </button>
        )}
      </div>
      <div className="mk-product-results" role="group" aria-label={t('products')}>
        {matches.map((product) => (
          <label
            className={`mk-product-option${selected.includes(product.sku) ? ' is-selected' : ''}`}
            key={product.sku}
          >
            <input
              type="checkbox"
              aria-label={product.name}
              checked={selected.includes(product.sku)}
              disabled={!selected.includes(product.sku) && selected.length >= MAX_MARKETING_PRODUCTS}
              onChange={(event) =>
                onChange(
                  event.target.checked ? [...selected, product.sku] : selected.filter((sku) => sku !== product.sku),
                )
              }
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- catalog thumbnails */}
            <img src={product.imageUrl || '/images/store/product-placeholder.svg'} alt="" loading="lazy" />
            <span>
              <strong>{product.name}</strong>
              <small>{product.sku}</small>
              <b>
                {new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
                  product.price,
                )}
              </b>
            </span>
          </label>
        ))}
        {!matches.length && (
          <div className="mk-picker-empty">
            <AdminIcon name="search" size={26} />
            <strong>{t('noProducts')}</strong>
            <p>{t('trySearch')}</p>
            {(query || onlySelected) && (
              <button
                type="button"
                className="mk-link"
                onClick={() => {
                  setQuery('');
                  setOnlySelected(false);
                }}
              >
                {t('showAll')}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mk-picker-bottom">
        <span role="status">{t('matchingProducts', { count: matches.length })}</span>
        <button
          type="button"
          className="mk-link"
          disabled={!matches.length || selected.length >= MAX_MARKETING_PRODUCTS}
          onClick={() =>
            onChange(
              [...new Set([...selected, ...matches.map((product) => product.sku)])].slice(0, MAX_MARKETING_PRODUCTS),
            )
          }
        >
          {t('selectResults')}
        </button>
      </div>
      {selected.length > 0 && (
        <div className="mk-selected-products">
          {selected.map((sku) => (
            <button
              type="button"
              key={sku}
              aria-label={t('removeProduct', { name: products.find((product) => product.sku === sku)?.name ?? sku })}
              onClick={() => onChange(selected.filter((item) => item !== sku))}
            >
              {products.find((product) => product.sku === sku)?.name ?? sku}
              <AdminIcon name="close" size={12} />
            </button>
          ))}
        </div>
      )}
      {selected.length === MAX_MARKETING_PRODUCTS && (
        <p className="mk-hint" role="status">
          {t('productLimit', { count: MAX_MARKETING_PRODUCTS })}
        </p>
      )}
    </section>
  );
}

export function MarketingMediaPicker({
  options,
  selected,
  onChange,
  onUpload,
  wantsVideo,
  multiple,
  uploading,
}: {
  options: MarketingMediaOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
  onUpload: (files: File[]) => void;
  wantsVideo: boolean;
  multiple: boolean;
  uploading?: string;
}) {
  const t = useTranslations('marketingStudio.selection');
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'all' | 'products' | 'uploads'>('all');
  const [dragging, setDragging] = useState(false);
  const limit = multiple ? MAX_MARKETING_IMAGES : 1;
  const compatible = useMemo(
    () => options.filter((option) => option.kind === (wantsVideo ? 'video' : 'image')),
    [options, wantsVideo],
  );
  const matches = compatible.filter(
    (option) =>
      (source === 'all' || (source === 'products' ? !!option.sku : !option.sku)) &&
      searchKey(option.title).includes(searchKey(query.trim())),
  );
  const move = (index: number, offset: number) => {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return (
    <section className="mk-selection" aria-labelledby={`${id}-label`}>
      <div className="mk-selection-heading">
        <div>
          <span className="mk-step">02</span>
          <h3 id={`${id}-label`}>{wantsVideo ? t('video') : t('images')}</h3>
        </div>
        <span className="mk-selection-count">
          {selected.length}/{limit}
        </span>
      </div>
      <p className="mk-hint">
        {multiple ? t('imagesHint', { count: MAX_MARKETING_IMAGES }) : wantsVideo ? t('videoHint') : t('singleHint')}
      </p>
      {selected.length > 0 && (
        <ol className="mk-media-selected" aria-label={t('imageOrder')}>
          {selected.map((key, index) => {
            const item = compatible.find((option) => option.key === key);
            return (
              <li key={key}>
                <div className="mk-selected-photo">
                  {item?.kind === 'video' ? (
                    <video src={item.url} muted preload="metadata" />
                  ) : item ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- selected marketing media */ <img
                      src={item.url}
                      alt={item.title}
                    />
                  ) : (
                    <AdminIcon name="box" />
                  )}
                  <span>{index === 0 ? t('cover') : index + 1}</span>
                  <button
                    type="button"
                    aria-label={t('removeImage', { index: index + 1 })}
                    onClick={() => onChange(selected.filter((entry) => entry !== key))}
                  >
                    <AdminIcon name="close" size={13} />
                  </button>
                </div>
                <div className="mk-image-reorder">
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={t('moveEarlier', { index: index + 1 })}
                    onClick={() => move(index, -1)}
                  >
                    ←
                  </button>
                  <span>{index + 1}</span>
                  <button
                    type="button"
                    disabled={index === selected.length - 1}
                    aria-label={t('moveLater', { index: index + 1 })}
                    onClick={() => move(index, 1)}
                  >
                    →
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mk-picker-search">
        <AdminIcon name="search" size={17} />
        <input
          type="search"
          aria-label={t('searchImages')}
          placeholder={t('searchImages')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="mk-picker-tools">
        <div className="mk-filter-chips">
          {(['all', 'products', 'uploads'] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              className={source === tab ? 'is-selected' : ''}
              aria-pressed={source === tab}
              onClick={() => setSource(tab)}
            >
              {t(`source.${tab}`)}
            </button>
          ))}
        </div>
        {selected.length > 0 && (
          <button type="button" className="mk-link" onClick={() => onChange([])}>
            {t('clear')}
          </button>
        )}
      </div>
      <div className="mk-media-library" role="group" aria-label={t('mediaLibrary')}>
        {matches.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`mk-library-image${selected.includes(item.key) ? ' is-selected' : ''}`}
            aria-pressed={selected.includes(item.key)}
            aria-label={item.title}
            title={item.title}
            disabled={multiple && selected.length >= limit && !selected.includes(item.key)}
            onClick={() =>
              onChange(
                selected.includes(item.key)
                  ? selected.filter((key) => key !== item.key)
                  : multiple
                    ? [...selected, item.key]
                    : [item.key],
              )
            }
          >
            {item.kind === 'video' ? (
              <video src={item.url} muted preload="metadata" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- library assets */ <img
                src={item.url}
                alt=""
                loading="lazy"
              />
            )}
            <span className="mk-media-check">{selected.includes(item.key) ? selected.indexOf(item.key) + 1 : '+'}</span>
            <small>{item.title}</small>
          </button>
        ))}
        {!matches.length && (
          <div className="mk-picker-empty">
            <AdminIcon name="box" size={24} />
            <strong>{t('noImages')}</strong>
            <p>{query ? t('trySearch') : t('mediaEmptyHint')}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        className={`mk-upload-zone${dragging ? ' is-dragging' : ''}`}
        disabled={!!uploading}
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!uploading) onUpload(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="mk-upload-icon">
          <AdminIcon name="arrow" size={20} />
        </span>
        <strong>{uploading || (wantsVideo ? t('uploadVideo') : t('uploadImages'))}</strong>
        <small>{wantsVideo ? 'MP4 · 50 MB' : t('uploadHint')}</small>
      </button>
      <input
        ref={fileRef}
        hidden
        type="file"
        multiple={!wantsVideo}
        aria-label={t('uploadLabel')}
        accept={wantsVideo ? 'video/mp4' : 'image/jpeg,image/png,image/webp,image/gif'}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) onUpload(files);
        }}
      />
    </section>
  );
}
