'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import ProductApi from '@/core/client/api/Product';
import type { AdminProduct } from '@/shared/types/product';
import useProductFormOptions from '../hooks/useProductFormOptions';
import ProductImagesField, { ImageItem, imageFromUrl, uploadPendingImages } from '../components/ProductImagesField';
import {
  BasicInfoFields,
  InventoryFields,
  PricingFields,
  StatusFields,
  SupplierField,
} from '../components/ProductFormSections';
import {
  ProductFormErrors,
  ProductFormValues,
  buildProductPayload,
  emptyProductForm,
  toFormValues,
  validateProductForm,
} from '../components/productForm';

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
    <h3 className="mb-5 text-lg font-semibold text-black dark:text-white">{title}</h3>
    {children}
  </section>
);

const ProductEdit = () => {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = Number(params.id);
  const { categories, suppliers } = useProductFormOptions();
  const [product, setProduct] = useState<AdminProduct | null>();
  const [values, setValues] = useState<ProductFormValues>(emptyProductForm);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [mainImage, setMainImage] = useState<ImageItem | null>(null);
  const [gallery, setGallery] = useState<ImageItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Resets the form to the stored product (initial load, "Huỷ" and after saving).
  const applyProduct = useCallback((loaded: AdminProduct) => {
    setProduct(loaded);
    setValues(toFormValues(loaded));
    setMainImage(imageFromUrl(loaded.imageUrl));
    setGallery(loaded.images.map(imageFromUrl));
    setErrors({});
  }, []);

  useEffect(() => {
    ProductApi.getAdminProduct(productId).then((loaded) => (loaded ? applyProduct(loaded) : setProduct(null)));
  }, [productId, applyProduct]);

  // An inactive supplier is not offered in the options but must stay selectable for products that use it.
  const supplierOptions = useMemo(() => {
    const current = product?.supplier;
    return current && !suppliers.some((supplier) => supplier.id === current.id) ? [current, ...suppliers] : suppliers;
  }, [product, suppliers]);

  const onChange = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const formErrors: ProductFormErrors = validateProductForm(values);
    if (!mainImage) formErrors.mainImage = 'Vui lòng chọn ảnh chính.';
    setErrors(formErrors);
    if (Object.keys(formErrors).length > 0 || !mainImage) return;

    setSaving(true);
    const urls = await uploadPendingImages([mainImage, ...gallery]);
    if (urls) {
      // Keep the uploaded URLs so that a retry after a validation error does not upload the files again.
      setMainImage(imageFromUrl(urls[0]));
      setGallery(urls.slice(1).map(imageFromUrl));
    }
    const updated = urls
      ? await ProductApi.updateProduct(productId, { ...buildProductPayload(values, urls[0], urls.slice(1)), expectedStock: product?.stock })
      : undefined;
    setSaving(false);
    if (updated) applyProduct(updated);
  };

  const remove = async () => {
    if (await ProductApi.deleteProduct(productId)) router.push('/admin/products');
    setConfirmingDelete(false);
  };

  if (product === undefined) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (product === null) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4">Không tìm thấy sản phẩm.</p>
        <Link href="/admin/products" className="font-medium text-brand-hover hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const total = product.sold + product.stock;

  return (
    <>
      <Breadcrumb pageName="Chỉnh sửa sản phẩm" />
      <p className="-mt-4 mb-6 text-body">
        Thông tin sản phẩm - ID: {product.id} · Đã bán / Tổng số lượng: {product.sold} / {total}
      </p>
      <div className="flex flex-col gap-6">
        <Card title="Thông tin cơ bản">
          <BasicInfoFields values={values} errors={errors} onChange={onChange} categories={categories} />
        </Card>
        <Card title="Hình ảnh sản phẩm">
          <ProductImagesField
            mainImage={mainImage}
            gallery={gallery}
            onMainImageChange={setMainImage}
            onGalleryChange={setGallery}
            error={errors.mainImage}
          />
        </Card>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title="Giá cả">
            <PricingFields values={values} errors={errors} onChange={onChange} />
          </Card>
          <Card title="Nhà cung cấp và trạng thái">
            <div className="flex flex-col gap-6">
              <SupplierField values={values} onChange={onChange} suppliers={supplierOptions} />
              <StatusFields values={values} onChange={onChange} />
            </div>
          </Card>
        </div>
        <Card title="Kho hàng">
          <InventoryFields values={values} errors={errors} onChange={onChange} />
        </Card>

        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-md border border-danger px-5 py-2 font-medium text-danger hover:bg-danger hover:text-white"
          >
            Xoá sản phẩm
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => applyProduct(product)}
              disabled={saving}
              className="rounded-md border border-stroke px-5 py-2 font-medium dark:border-strokedark"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmingDelete}
        title="Xoá sản phẩm"
        message={
          <>
            Bạn có chắc muốn xoá <strong>{product.name}</strong>? Thao tác này không thể hoàn tác. Nếu chỉ muốn ẩn sản
            phẩm, hãy chọn &quot;Tạm ngưng&quot;.
          </>
        }
        confirmLabel="Xoá"
        danger
        onConfirm={remove}
        onClose={() => setConfirmingDelete(false)}
      />
    </>
  );
};

export default ProductEdit;
