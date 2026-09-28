'use client';

import { FormEvent } from 'react';
import { inputClassName } from '@/components/FormElements/TextField';
import { formatVND } from '@/shared/server/utils/utils';
import type { Category, ProductSort } from '@/shared/types/product';

export interface ProductFilterValues {
  q: string;
  category: string;
  gender: string;
  brand: string;
  maxPrice: number;
  inStock: boolean;
  sort: ProductSort | '';
}

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
  { value: 'name', label: 'Tên A-Z' },
  { value: 'best_selling', label: 'Bán chạy' },
  { value: 'rating', label: 'Đánh giá cao' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'unisex', label: 'Unisex' },
];

const PRICE_STEP = 50000;

interface ProductFiltersProps {
  values: ProductFilterValues;
  categories: Category[];
  brands: string[];
  priceLimit: number;
  onChange: (values: ProductFilterValues) => void;
  onSubmit: () => void;
  onReset: () => void;
}

const labelClassName = 'mb-2 block text-sm font-medium text-black dark:text-white';

const ProductFilters = ({
  values,
  categories,
  brands,
  priceLimit,
  onChange,
  onSubmit,
  onReset,
}: ProductFiltersProps) => {
  const update = <K extends keyof ProductFilterValues>(key: K, value: ProductFilterValues[K]) =>
    onChange({ ...values, [key]: value });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-5 rounded-md border border-stroke bg-white p-5 dark:border-store-card dark:bg-store-panel sm:grid-cols-2 lg:grid-cols-4"
    >
      <div>
        <label htmlFor="filter-q" className={labelClassName}>
          Tìm sản phẩm
        </label>
        <input
          id="filter-q"
          className={inputClassName}
          placeholder="Tên, thương hiệu..."
          value={values.q}
          onChange={(event) => update('q', event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="filter-category" className={labelClassName}>
          Loại sản phẩm
        </label>
        <select
          id="filter-category"
          className={inputClassName}
          value={values.category}
          onChange={(event) => update('category', event.target.value)}
        >
          <option value="">Tất cả</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
              {category.productCount !== undefined ? ` (${category.productCount})` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-gender" className={labelClassName}>
          Giới tính
        </label>
        <select
          id="filter-gender"
          className={inputClassName}
          value={values.gender}
          onChange={(event) => update('gender', event.target.value)}
        >
          <option value="">Tất cả</option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-brand" className={labelClassName}>
          Thương hiệu
        </label>
        <select
          id="filter-brand"
          className={inputClassName}
          value={values.brand}
          onChange={(event) => update('brand', event.target.value)}
        >
          <option value="">Tất cả</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="filter-price" className={labelClassName}>
          Giá tối đa: <span className="font-semibold text-brand-hover">{formatVND(values.maxPrice)}</span>
        </label>
        <input
          id="filter-price"
          type="range"
          min={0}
          max={priceLimit}
          step={PRICE_STEP}
          value={values.maxPrice}
          onChange={(event) => update('maxPrice', Number(event.target.value))}
          className="w-full accent-brand-hover"
        />
        <div className="flex justify-between text-xs text-body dark:text-store-muted">
          <span>{formatVND(0)}</span>
          <span>{formatVND(priceLimit)}</span>
        </div>
      </div>
      <div>
        <label htmlFor="filter-sort" className={labelClassName}>
          Sắp xếp
        </label>
        <select
          id="filter-sort"
          className={inputClassName}
          value={values.sort}
          onChange={(event) => update('sort', event.target.value as ProductSort)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-3 self-end pb-3 font-medium text-black dark:text-white">
        <input
          type="checkbox"
          className="h-5 w-5 accent-brand-hover"
          checked={values.inStock}
          onChange={(event) => update('inStock', event.target.checked)}
        />
        Chỉ hiện sản phẩm còn hàng
      </label>
      <div className="flex gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          className="flex-1 rounded-md bg-brand px-4 py-3 font-semibold text-brand-ink hover:bg-brand-hover"
        >
          Tìm kiếm
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-md bg-gray px-4 py-3 font-semibold text-black hover:opacity-90 dark:bg-store-card dark:text-store-text"
        >
          Đặt lại tất cả
        </button>
      </div>
    </form>
  );
};

export default ProductFilters;
