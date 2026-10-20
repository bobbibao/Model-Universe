'use client';

import { catalogFormula } from '@/shared/sale-pricing';

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
    locale = useLocale(),
    en = locale === 'en';
  let result: ReturnType<typeof catalogFormula> | undefined;
  let formulaError = '';
  if (values.pricingReferenceMemberVnd) {
    try {
      result = catalogFormula(Number(values.pricingReferenceMemberVnd), Number(values.pricingIssueCount));
    } catch (error) {
      formulaError = en
        ? 'The reference price or condition needs appraisal under the standard buyback table.'
        : (error as Error).message;
    }
  }
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <TextField
        label={en ? 'Market reference · member price S (VND)' : 'Tham chiếu thị trường · giá thành viên S (đ)'}
        name="pricingReferenceMemberVnd"
        inputMode="numeric"
        value={values.pricingReferenceMemberVnd}
        placeholder="1.100.000"
        onChange={(e) => onChange('pricingReferenceMemberVnd', e.target.value.replace(/\D/g, ''))}
      />
      <TextField
        label={en ? 'Ordinary issues (50,000 VND each)' : 'Số lỗi thông thường (50.000đ/lỗi)'}
        name="pricingIssueCount"
        type="number"
        min={0}
        max={100}
        value={values.pricingIssueCount}
        onChange={(e) => onChange('pricingIssueCount', e.target.value)}
      />
      <div className="rounded-xl border border-stroke bg-gray p-4 dark:border-store-card dark:bg-store-panel md:col-span-2">
        <p className="text-sm font-semibold">
          {en ? 'Calculated prices · outputs cannot be edited' : 'Giá theo công thức · không nhập đè kết quả'}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-body">{en ? 'Expected buyback B' : 'Giá thu dự kiến B'}</dt>
            <dd className="mt-1 font-bold">{result ? formatVND(result.buybackPriceVnd, locale) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-body">{en ? 'Public list price R' : 'Giá niêm yết R'}</dt>
            <dd className="mt-1 font-bold">{formatVND(result?.listPriceVnd || Number(values.price) || 0, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-body">{en ? 'After an eligible 10% code' : 'Sau mã 10% hợp lệ'}</dt>
            <dd className="mt-1 font-bold">{result ? formatVND(result.referenceMemberVnd, locale) : '—'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-6 text-body">
          {en
            ? 'B = S − tier deduction − 50,000 × issues. R ≈ S ÷ 0.9. Serious damage or reference above 5 million requires appraisal; no automatic price is invented.'
            : 'B = S − khoản trừ theo bậc − 50.000 × số lỗi. R ≈ S ÷ 0,9. Lỗi nặng hoặc tham chiếu trên 5 triệu cần thẩm định, không tự đặt công thức ngoài bảng.'}
        </p>
        {formulaError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {formulaError}
          </p>
        )}
        {errors.price && <p className="mt-2 text-sm text-danger">{t(`validation.${errors.price}`)}</p>}
      </div>
      <div className="md:col-span-2">
        <TextField
          label={
            en ? 'Actual cost C · from the purchase / intake record' : 'Giá vốn thực tế C · theo chứng từ nhập/thu'
          }
          name="importPrice"
          inputMode="numeric"
          value={values.importPrice}
          onChange={(e) => onChange('importPrice', e.target.value.replace(/\D/g, ''))}
          error={errors.importPrice ? t(`validation.${errors.importPrice}`) : undefined}
        />
        <p className="mt-2 text-xs leading-6 text-body">
          {en
            ? 'Actual cost is kept separately from the calculated buyback offer. It determines whether sale and voucher combinations are safe.'
            : 'Giá vốn đã chi giữ riêng với giá thu dự kiến. Hệ thống dùng giá vốn để kiểm tra sale và voucher có thể cộng dồn.'}
        </p>
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
      <fieldset className="grid grid-cols-2 gap-4 rounded-lg border border-stroke p-4 md:col-span-2 md:grid-cols-4 dark:border-dark-3">
        <legend className="px-1 text-sm font-semibold text-black dark:text-white">{t('packaging.title')}</legend>
        <p className="col-span-2 text-sm text-dark-5 md:col-span-4">{t('packaging.hint')}</p>
        {(
          [
            ['packLengthCm', 'lengthCm'],
            ['packWidthCm', 'widthCm'],
            ['packHeightCm', 'heightCm'],
            ['packWeightGram', 'weightGram'],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            label={t(`packaging.${label}`)}
            name={key}
            inputMode="numeric"
            value={values[key]}
            onChange={(event) => onChange(key, event.target.value.replace(/\D/g, ''))}
          />
        ))}
        {errors.packLengthCm && (
          <p className="col-span-2 text-sm text-danger md:col-span-4">{t(`validation.${errors.packLengthCm}`)}</p>
        )}
        <label className="col-span-2 flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-brand-hover"
            checked={values.packFragile}
            onChange={(event) => onChange('packFragile', event.target.checked)}
          />
          <span className="text-sm">{t('packaging.fragile')}</span>
        </label>
        <label className="col-span-2 flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-brand-hover"
            checked={values.packAnyOrientation}
            onChange={(event) => onChange('packAnyOrientation', event.target.checked)}
          />
          <span className="text-sm">{t('packaging.anyOrientation')}</span>
        </label>
      </fieldset>
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
