import type { GunplaGrade, ModelCondition, AssemblyState } from '@/shared/gunpla';
import type { AdminProduct, InventoryStatus, ProductGender, ProductPayload } from '@/shared/types/product';

// Form state: numeric fields are kept as strings while editing.
export interface ProductFormValues {
  grade: GunplaGrade | '';
  scale: string;
  series: string;
  modelCode: string;
  condition: ModelCondition;
  assemblyState: AssemblyState;
  boxCondition: string;
  includedAccessories: string;
  defects: string;
  descriptionEn: string;
  descriptionVi: string;
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
  inventoryStatus: InventoryStatus;
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues | 'mainImage', string>>;

export const emptyProductForm: ProductFormValues = {
  grade: '', scale: '', series: '', modelCode: '', condition: 'new', assemblyState: 'unassembled',
  boxCondition: '', includedAccessories: '', defects: '', descriptionEn: '', descriptionVi: '',
  name: '',
  brandName: '',
  description: '',
  categoryId: '',
  gender: 'unisex',
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
  inventoryStatus: 'available',
};

// A hold set by the shop agent (or an admin) hides the product from the storefront until it is released here.
export const INVENTORY_STATUS_OPTIONS: { value: InventoryStatus; label: string }[] = [
  { value: 'available', label: 'Sẵn sàng bán' },
  { value: 'quarantine', label: 'Cách ly kiểm tra' },
  { value: 'donation_pending', label: 'Chờ quyên góp' },
  { value: 'recycle', label: 'Chờ tái chế' },
];

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'unisex', label: 'Unisex' },
];

export const toFormValues = (product: AdminProduct): ProductFormValues => ({
  grade: product.grade || '', scale: product.scale || '', series: product.series || '', modelCode: product.modelCode || '',
  condition: product.condition || 'new', assemblyState: product.assemblyState || 'unassembled', boxCondition: product.boxCondition || '',
  includedAccessories: (product.includedAccessories || []).join('\n'), defects: (product.defects || []).join('\n'),
  descriptionEn: product.descriptionEn || product.description || '', descriptionVi: product.descriptionVi || '',
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
  inventoryStatus: product.inventoryStatus,
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
  grade: values.grade || null, scale: values.scale || null, series: values.series || null, modelCode: values.modelCode || null,
  condition: values.condition, assemblyState: values.assemblyState, boxCondition: values.boxCondition || null,
  includedAccessories: values.includedAccessories.split('\n').map(value => value.trim()).filter(Boolean),
  defects: values.defects.split('\n').map(value => value.trim()).filter(Boolean),
  descriptionEn: values.descriptionEn, descriptionVi: values.descriptionVi,
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
  inventoryStatus: values.inventoryStatus,
});
