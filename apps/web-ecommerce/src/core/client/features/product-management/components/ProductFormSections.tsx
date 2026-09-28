'use client';

import TextField, { inputClassName } from '@/components/FormElements/TextField';
import SelectField from '@/components/FormElements/SelectField';
import { formatVND } from '@/shared/server/utils/utils';
import type { Category } from '@/shared/types/product';
import type { SupplierOption } from '@/core/client/api/Supplier';
import { GENDER_OPTIONS, ProductFormErrors, ProductFormValues } from './productForm';

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
}: SectionProps & { categories: Category[] }) => (
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
    <TextField
      label="Tên sản phẩm"
      name="name"
      value={values.name}
      onChange={(event) => onChange('name', event.target.value)}
      error={errors.name}
    />
    <TextField
      label="Thương hiệu"
      name="brandName"
      value={values.brandName}
      onChange={(event) => onChange('brandName', event.target.value)}
      error={errors.brandName}
    />
    <SelectField
      label="Loại sản phẩm"
      name="categoryId"
      placeholder="Chọn loại sản phẩm"
      options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
      value={values.categoryId}
      onChange={(event) => onChange('categoryId', event.target.value)}
      error={errors.categoryId}
    />
    <SelectField
      label="Giới tính"
      name="gender"
      placeholder="Chọn giới tính"
      options={GENDER_OPTIONS}
      value={values.gender}
      onChange={(event) => onChange('gender', event.target.value as ProductFormValues['gender'])}
      error={errors.gender}
    />
    <TextField
      label="Kích thước có sẵn (cách nhau bởi dấu phẩy)"
      name="availableSizes"
      placeholder="VD: 38, 39, 40 hoặc S, M, L"
      className="md:col-span-2"
      value={values.availableSizes}
      onChange={(event) => onChange('availableSizes', event.target.value)}
    />
    <div className="md:col-span-2">
      <label htmlFor="description" className="mb-2 block text-sm font-medium text-black dark:text-white">
        Mô tả
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

export const PricingFields = ({ values, errors, onChange }: SectionProps) => (
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
    <div>
      <TextField
        label="Giá nhập (VND)"
        name="importPrice"
        inputMode="numeric"
        value={values.importPrice}
        onChange={(event) => onChange('importPrice', event.target.value.replace(/\D/g, ''))}
        error={errors.importPrice}
      />
      {values.importPrice && <p className="mt-1 text-sm text-body">{formatVND(Number(values.importPrice))}</p>}
    </div>
    <div>
      <TextField
        label="Giá bán (VND)"
        name="price"
        inputMode="numeric"
        value={values.price}
        onChange={(event) => onChange('price', event.target.value.replace(/\D/g, ''))}
        error={errors.price}
      />
      {values.price && <p className="mt-1 text-sm text-body">{formatVND(Number(values.price))}</p>}
    </div>
  </div>
);

export const InventoryFields = ({ values, errors, onChange }: SectionProps) => (
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
    <TextField
      label="Số lượng tồn kho"
      name="stock"
      inputMode="numeric"
      value={values.stock}
      onChange={(event) => onChange('stock', event.target.value.replace(/\D/g, ''))}
      error={errors.stock}
    />
    <TextField
      label="SKU"
      name="sku"
      value={values.sku}
      onChange={(event) => onChange('sku', event.target.value)}
      error={errors.sku}
    />
    <TextField
      label="Khối lượng"
      name="weight"
      placeholder="VD: 0.5 kg"
      value={values.weight}
      onChange={(event) => onChange('weight', event.target.value)}
    />
    <TextField
      label="Kích thước đóng gói"
      name="dimensions"
      placeholder="VD: 30 x 20 x 10 cm"
      value={values.dimensions}
      onChange={(event) => onChange('dimensions', event.target.value)}
    />
    <TextField
      label="Ngày nhập"
      name="productionDate"
      type="date"
      value={values.productionDate}
      onChange={(event) => onChange('productionDate', event.target.value)}
    />
  </div>
);

export const SupplierField = ({
  values,
  onChange,
  suppliers,
}: Omit<SectionProps, 'errors'> & { suppliers: SupplierOption[] }) => (
  <SelectField
    label="Nhà cung cấp"
    name="supplierId"
    placeholder="Không chọn"
    options={suppliers.map((supplier) => ({
      value: String(supplier.id),
      label: `${supplier.id} - ${supplier.name}`,
    }))}
    value={values.supplierId}
    onChange={(event) => onChange('supplierId', event.target.value)}
  />
);

export const StatusFields = ({ values, onChange }: Omit<SectionProps, 'errors'>) => (
  <div className="flex flex-col gap-4">
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 accent-brand-hover"
        checked={values.isArchived}
        onChange={(event) => onChange('isArchived', event.target.checked)}
      />
      <span>
        <span className="block font-medium text-black dark:text-white">Tạm ngưng</span>
        <span className="text-sm text-body">Sản phẩm này sẽ không còn hiển thị trên trang web.</span>
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
        <span className="block font-medium text-black dark:text-white">Nổi bật</span>
        <span className="text-sm text-body">Sản phẩm này sẽ được hiển thị ở trang chủ.</span>
      </span>
    </label>
  </div>
);
