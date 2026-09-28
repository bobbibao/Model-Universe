import type { AdminProduct, ProductGender, ProductPayload } from '@/shared/types/product';

// Form state: numeric fields are kept as strings while editing.
export interface ProductFormValues {
  name: string;
  brandName: string;
  description: string;
  categoryId: string;
  gender: ProductGender | '';
  availableSizes: string;
  price: string;
  importPrice: string;
  stock: string;
  sku: string;
  weight: string;
  dimensions: string;
  productionDate: string;
  supplierId: string;
  isFeatured: boolean;
  isArchived: boolean;
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues | 'mainImage', string>>;

export const emptyProductForm: ProductFormValues = {
  name: '',
  brandName: '',
  description: '',
  categoryId: '',
  gender: '',
  availableSizes: '',
  price: '',
  importPrice: '',
  stock: '0',
  sku: '',
  weight: '',
  dimensions: '',
  productionDate: '',
  supplierId: '',
  isFeatured: false,
  isArchived: false,
};

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'unisex', label: 'Unisex' },
];

export const toFormValues = (product: AdminProduct): ProductFormValues => ({
  name: product.name,
  brandName: product.brandName,
  description: product.description || '',
  categoryId: String(product.categoryId),
  gender: product.gender,
  availableSizes: product.availableSizes.join(', '),
  price: String(product.price),
  importPrice: String(product.importPrice),
  stock: String(product.stock),
  sku: product.sku,
  weight: product.weight || '',
  dimensions: product.dimensions || '',
  productionDate: product.productionDate ? product.productionDate.slice(0, 10) : '',
  supplierId: product.supplierId ? String(product.supplierId) : '',
  isFeatured: product.isFeatured,
  isArchived: product.isArchived,
});

const isWholeNumber = (value: string, min: number) => /^\d+$/.test(value.trim()) && Number(value) >= min;

export const validateBasics = (values: ProductFormValues): ProductFormErrors => {
  const errors: ProductFormErrors = {};
  if (!values.name.trim()) errors.name = 'Vui lòng nhập tên sản phẩm.';
  if (!values.brandName.trim()) errors.brandName = 'Vui lòng nhập thương hiệu.';
  if (!values.categoryId) errors.categoryId = 'Vui lòng chọn loại sản phẩm.';
  if (!values.gender) errors.gender = 'Vui lòng chọn giới tính.';
  return errors;
};

export const validatePricing = (values: ProductFormValues): ProductFormErrors => {
  const errors: ProductFormErrors = {};
  if (!isWholeNumber(values.price, 1)) errors.price = 'Giá bán phải là số nguyên lớn hơn 0.';
  if (values.importPrice && !isWholeNumber(values.importPrice, 0)) errors.importPrice = 'Giá nhập phải là số nguyên.';
  return errors;
};

export const validateInventory = (values: ProductFormValues): ProductFormErrors => {
  const errors: ProductFormErrors = {};
  if (!isWholeNumber(values.stock, 0)) errors.stock = 'Tồn kho phải là số nguyên không âm.';
  if (!values.sku.trim()) errors.sku = 'Vui lòng nhập SKU.';
  return errors;
};

export const validateProductForm = (values: ProductFormValues): ProductFormErrors => ({
  ...validateBasics(values),
  ...validatePricing(values),
  ...validateInventory(values),
});

export const buildProductPayload = (values: ProductFormValues, imageUrl: string, images: string[]): ProductPayload => ({
  name: values.name.trim(),
  brandName: values.brandName.trim(),
  sku: values.sku.trim(),
  description: values.description.trim(),
  gender: values.gender as ProductGender,
  categoryId: Number(values.categoryId),
  supplierId: values.supplierId ? Number(values.supplierId) : null,
  availableSizes: values.availableSizes
    .split(',')
    .map((size) => size.trim())
    .filter(Boolean),
  price: Number(values.price),
  importPrice: values.importPrice ? Number(values.importPrice) : 0,
  stock: Number(values.stock),
  weight: values.weight.trim(),
  dimensions: values.dimensions.trim(),
  productionDate: values.productionDate || null,
  imageUrl,
  images,
  isFeatured: values.isFeatured,
  isArchived: values.isArchived,
});
