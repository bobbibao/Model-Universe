'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ClickOutside from '@/components/ClickOutside';
import { inputClassName } from '@/components/FormElements/TextField';
import ProductApi from '@/core/client/api/Product';
import type { AdminProductListItem } from '@/shared/types/product';

const SEARCH_DEBOUNCE_MS = 300;
const RESULT_LIMIT = 10;

export type PickedProduct = Pick<AdminProductListItem, 'id' | 'name' | 'sku' | 'stock' | 'importPrice'>;

interface ProductPickerProps {
  value: PickedProduct | null;
  onChange: (product: PickedProduct) => void;
  excludeIds: number[];
}

// Searchable product select ("id - name").
const ProductPicker = ({ value, onChange, excludeIds }: ProductPickerProps) => {
  const t = useTranslations('productPicker');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminProductListItem[]>([]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      const result = await ProductApi.getAdminProducts({ q: search.trim(), per_page: RESULT_LIMIT, sort: 'name' });
      setResults(result?.data || []);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, search]);

  return (
    <ClickOutside onClick={() => setOpen(false)} className="relative">
      <input
        className={inputClassName}
        placeholder={t('search')}
        aria-label={t('search')}
        value={open ? search : value ? `${value.id} - ${value.name}` : ''}
        onFocus={() => {
          setSearch('');
          setOpen(true);
        }}
        onChange={(event) => setSearch(event.target.value)}
      />
      {open && (
        <ul className="absolute z-99 mt-1 max-h-72 w-full overflow-y-auto rounded border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-body">{t('empty')}</li>}
          {results.map((product) => {
            const taken = excludeIds.includes(product.id);
            return (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={taken}
                  onClick={() => {
                    onChange(product);
                    setOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-meta-4"
                >
                  <span className="block font-medium text-black dark:text-white">
                    {product.id} - {product.name}
                  </span>
                  <span className="text-xs text-body">
                    SKU {product.sku} · {t('stock', { count: product.stock })}
                    {product.isArchived ? ` · ${t('archived')}` : ''}
                    {taken ? ` · ${t('selected')}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ClickOutside>
  );
};

export default ProductPicker;
