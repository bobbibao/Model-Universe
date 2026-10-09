'use client';

import { useLocale, useTranslations } from 'next-intl';
import { GRADES, ASSEMBLY_STATES } from '@/shared/gunpla';
import TextField, { inputClassName } from '@/components/FormElements/TextField';
import SelectField from '@/components/FormElements/SelectField';
import { formatVND } from '@/shared/server/utils/utils';
import type { Category } from '@/shared/types/product';
import type { SupplierOption } from '@/core/client/api/Supplier';
import { INVENTORY_STATUS_VALUES, ProductFormErrors, ProductFormValues } from './productForm';
import type { InventoryStatus } from '@/shared/types/product';

interface SectionProps {
  values: ProductFormValues;
  errors: ProductFormErrors;
  onChange: <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => void;
}

export const BasicInfoFields = ({
  values,
  errors,
  onChange,
  categories,
}: SectionProps & { categories: Category[] }) => {
  const t = useTranslations('adminProducts');
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <TextField
        label={t('name')}
        name="name"
        value={values.name}
        onChange={(event) => onChange('name', event.target.value)}
        error={errors.name ? t(`validation.${errors.name}`) : undefined}
      />
      <TextField
        label={t('brand')}
        name="brandName"
        value={values.brandName}
        onChange={(event) => onChange('brandName', event.target.value)}
        error={errors.brandName ? t(`validation.${errors.brandName}`) : undefined}
      />
      <SelectField
        label={t('category')}
        name="categoryId"
        placeholder={t('selectCategory')}
        options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
        value={values.categoryId}
        onChange={(event) => onChange('categoryId', event.target.value)}
        error={errors.categoryId ? t(`validation.${errors.categoryId}`) : undefined}
      />
      <GunplaFields values={values} errors={errors} onChange={onChange} />
      <div className="md:col-span-2">
        <label htmlFor="description" className="mb-2 block text-sm font-medium text-black dark:text-white">
          {t('description')}
        </label>
        <textarea
          id="description"
          rows={5}
          className={inputClassName}
          value={values.description}
          onChange={(event) => onChange('description', event.target.value)}
        />
      </div>
    </div>
  );
};

export const PricingFields = ({ values, errors, onChange }: SectionProps) => {
  const t = useTranslations('adminProducts'),
    locale = useLocale();
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div>
        <TextField
          label={t('importPrice')}
          name="importPrice"
          inputMode="numeric"
          value={values.importPrice}
          onChange={(event) => onChange('importPrice', event.target.value.replace(/\D/g, ''))}
          error={errors.importPrice ? t(`validation.${errors.importPrice}`) : undefined}
        />
        {values.importPrice && (
          <p className="mt-1 text-sm text-body">{formatVND(Number(values.importPrice), locale)}</p>
        )}
      </div>
      <div>
        <TextField
          label={t('sellingPrice')}
          name="price"
          inputMode="numeric"
          value={values.price}
          onChange={(event) => onChange('price', event.target.value.replace(/\D/g, ''))}
          error={errors.price ? t(`validation.${errors.price}`) : undefined}
        />
        {values.price && <p className="mt-1 text-sm text-body">{formatVND(Number(values.price), locale)}</p>}
      </div>
    </div>
  );
};

export const InventoryFields = ({ values, errors, onChange }: SectionProps) => {
  const t = useTranslations('adminProducts');
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <TextField
        label={t('stock')}
        name="stock"
        inputMode="numeric"
        value={values.stock}
        onChange={(event) => onChange('stock', event.target.value.replace(/\D/g, ''))}
        error={errors.stock ? t(`validation.${errors.stock}`) : undefined}
      />
      <TextField
        label="SKU"
        name="sku"
        value={values.sku}
        onChange={(event) => onChange('sku', event.target.value)}
        error={errors.sku ? t(`validation.${errors.sku}`) : undefined}
      />
      <TextField
        label={t('weight')}
        name="weight"
        placeholder={t('weightExample')}
        value={values.weight}
        onChange={(event) => onChange('weight', event.target.value)}
      />
      <TextField
        label={t('dimensions')}
        name="dimensions"
        placeholder={t('dimensionsExample')}
        value={values.dimensions}
        onChange={(event) => onChange('dimensions', event.target.value)}
      />
      <TextField
        label={t('receivedDate')}
        name="productionDate"
        type="date"
        value={values.productionDate}
        onChange={(event) => onChange('productionDate', event.target.value)}
      />
    </div>
  );
};

export const SupplierField = ({
  values,
  onChange,
  suppliers,
}: Omit<SectionProps, 'errors'> & { suppliers: SupplierOption[] }) => {
  const t = useTranslations('adminProducts');
  return (
    <SelectField
      label={t('supplier')}
      name="supplierId"
      placeholder={t('noSupplier')}
      options={suppliers.map((supplier) => ({
        value: String(supplier.id),
        label: `${supplier.id} - ${supplier.name}`,
      }))}
      value={values.supplierId}
      onChange={(event) => onChange('supplierId', event.target.value)}
    />
  );
};

export const StatusFields = ({ values, onChange }: Omit<SectionProps, 'errors'>) => {
  const t = useTranslations('adminProducts');
  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label={t('inventoryStatus')}
        name="inventoryStatus"
        options={INVENTORY_STATUS_VALUES.map((value) => ({ value, label: t(`inventoryStates.${value}`) }))}
        value={values.inventoryStatus}
        onChange={(event) => onChange('inventoryStatus', event.target.value as InventoryStatus)}
      />
      {values.inventoryStatus !== 'available' && <p className="-mt-2 text-sm text-body">{t('heldNote')}</p>}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-brand-hover"
          checked={values.isArchived}
          onChange={(event) => onChange('isArchived', event.target.checked)}
        />
        <span>
          <span className="block font-medium text-black dark:text-white">{t('archived')}</span>
          <span className="text-sm text-body">{t('hiddenNote')}</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-brand-hover"
          checked={values.isFeatured}
          onChange={(event) => onChange('isFeatured', event.target.checked)}
        />
        <span>
          <span className="block font-medium text-black dark:text-white">{t('featured')}</span>
          <span className="text-sm text-body">{t('featuredNote')}</span>
        </span>
      </label>
    </div>
  );
};

function GunplaFields({ values, onChange }: SectionProps) {
  const t = useTranslations('catalog'),
    admin = useTranslations('adminProducts');
  return (
    <>
      <SelectField
        label={t('grade')}
        name="grade"
        placeholder={admin('unknownGrade')}
        options={GRADES.map((value) => ({ value, label: value }))}
        value={values.grade}
        onChange={(event) => onChange('grade', event.target.value as ProductFormValues['grade'])}
      />
      {(['scale', 'series', 'modelCode', 'boxCondition'] as const).map((field) => (
        <TextField
          key={field}
          label={t(field === 'boxCondition' ? 'box' : field)}
          name={field}
          value={values[field]}
          onChange={(event) => onChange(field, event.target.value)}
        />
      ))}
      <SelectField
        label={t('condition')}
        name="condition"
        options={['new', 'preowned'].map((value) => ({ value, label: t(value) }))}
        value={values.condition}
        onChange={(event) => onChange('condition', event.target.value as ProductFormValues['condition'])}
      />
      <SelectField
        label={t('assembly')}
        name="assemblyState"
        options={ASSEMBLY_STATES.map((value) => ({ value, label: t(value) }))}
        value={values.assemblyState}
        onChange={(event) => onChange('assemblyState', event.target.value as ProductFormValues['assemblyState'])}
      />
      {(['includedAccessories', 'defects', 'descriptionEn', 'descriptionVi'] as const).map((field) => (
        <div className="md:col-span-2" key={field}>
          <label className="mu-field" htmlFor={field}>
            {t(field === 'includedAccessories' ? 'accessories' : field)}
          </label>
          <textarea
            id={field}
            className="mu-input"
            rows={3}
            value={values[field]}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </div>
      ))}
    </>
  );
}
