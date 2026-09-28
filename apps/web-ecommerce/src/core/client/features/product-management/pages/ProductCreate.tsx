'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import Stepper from '@/components/Stepper/Stepper';
import ProductApi from '@/core/client/api/Product';
import { formatVND } from '@/shared/server/utils/utils';
import useProductFormOptions from '../hooks/useProductFormOptions';
import ProductImagesField, { ImageItem, imageFromUrl, uploadPendingImages } from '../components/ProductImagesField';
import { BasicInfoFields, InventoryFields, PricingFields, SupplierField } from '../components/ProductFormSections';
import {
  ProductFormErrors,
  ProductFormValues,
  buildProductPayload,
  emptyProductForm,
  validateBasics,
  validateInventory,
  validatePricing,
} from '../components/productForm';

const STEPS = ['Thông tin cơ bản', 'Hình ảnh', 'Giá cả', 'Kho hàng', 'Nhà cung cấp'];

const ProductCreate = () => {
  const router = useRouter();
  const { categories, suppliers } = useProductFormOptions();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ProductFormValues>(emptyProductForm);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [mainImage, setMainImage] = useState<ImageItem | null>(null);
  const [gallery, setGallery] = useState<ImageItem[]>([]);
  const [saving, setSaving] = useState(false);

  const onChange = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const validateStep = (index: number): ProductFormErrors => {
    if (index === 0) return validateBasics(values);
    if (index === 1) return mainImage ? {} : { mainImage: 'Vui lòng chọn ảnh chính.' };
    if (index === 2) return validatePricing(values);
    if (index === 3) return validateInventory(values);
    return {};
  };

  const next = () => {
    const stepErrors = validateStep(step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) setStep(step + 1);
  };

  const finish = async () => {
    // Re-check every step in case an earlier one was changed after moving on.
    for (let index = 0; index < STEPS.length; index++) {
      const stepErrors = validateStep(index);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        setStep(index);
        return;
      }
    }
    setSaving(true);
    const urls = await uploadPendingImages([mainImage as ImageItem, ...gallery]);
    if (urls) {
      // Keep the uploaded URLs so that a retry after a validation error does not upload the files again.
      setMainImage(imageFromUrl(urls[0]));
      setGallery(urls.slice(1).map(imageFromUrl));
    }
    const product = urls
      ? await ProductApi.createProduct(buildProductPayload(values, urls[0], urls.slice(1)))
      : undefined;
    setSaving(false);
    if (product) router.push('/admin/products');
  };

  const category = categories.find((item) => String(item.id) === values.categoryId);

  return (
    <>
      <Breadcrumb pageName="Thêm sản phẩm" />
      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-8">
        <div className="mb-8">
          <Stepper steps={STEPS} currentStep={step} />
        </div>

        {step === 0 && <BasicInfoFields values={values} errors={errors} onChange={onChange} categories={categories} />}
        {step === 1 && (
          <ProductImagesField
            mainImage={mainImage}
            gallery={gallery}
            onMainImageChange={setMainImage}
            onGalleryChange={setGallery}
            error={errors.mainImage}
          />
        )}
        {step === 2 && <PricingFields values={values} errors={errors} onChange={onChange} />}
        {step === 3 && <InventoryFields values={values} errors={errors} onChange={onChange} />}
        {step === 4 && (
          <div className="flex flex-col gap-6">
            <SupplierField values={values} onChange={onChange} suppliers={suppliers} />
            <div className="rounded-md bg-gray-2 p-5 dark:bg-meta-4">
              <h3 className="mb-3 font-semibold text-black dark:text-white">Xác nhận thông tin</h3>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="inline text-body">Tên: </dt>
                  <dd className="inline font-medium">{values.name}</dd>
                </div>
                <div>
                  <dt className="inline text-body">Thương hiệu: </dt>
                  <dd className="inline font-medium">{values.brandName}</dd>
                </div>
                <div>
                  <dt className="inline text-body">Loại: </dt>
                  <dd className="inline font-medium">{category?.name}</dd>
                </div>
                <div>
                  <dt className="inline text-body">Giá bán: </dt>
                  <dd className="inline font-medium">{values.price && formatVND(Number(values.price))}</dd>
                </div>
                <div>
                  <dt className="inline text-body">Tồn kho: </dt>
                  <dd className="inline font-medium">{values.stock}</dd>
                </div>
                <div>
                  <dt className="inline text-body">Số ảnh: </dt>
                  <dd className="inline font-medium">{(mainImage ? 1 : 0) + gallery.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/products')}
            className="rounded-md px-4 py-2 font-medium text-body hover:underline"
          >
            Thoát
          </button>
          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={saving}
                className="rounded-md border border-stroke px-5 py-2 font-medium dark:border-strokedark"
              >
                Quay lại
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
              >
                Tiếp
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
              >
                {saving ? 'Đang lưu...' : 'Hoàn thành'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ProductCreate;
