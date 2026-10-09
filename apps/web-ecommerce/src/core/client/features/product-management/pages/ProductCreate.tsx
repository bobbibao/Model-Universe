'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

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

const ProductCreate = () => {
  const router = useRouter();
  const t = useTranslations('adminProducts'),
    locale = useLocale();
  const steps = ['basics', 'images', 'pricing', 'inventory', 'supplier'].map((key) => t(key));
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
    if (index === 1) return mainImage ? {} : { mainImage: 'mainImageRequired' };
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
    for (let index = 0; index < steps.length; index++) {
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
      <Breadcrumb pageName={t('create')} />
      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-8">
        <div className="mb-8">
          <Stepper steps={steps} currentStep={step} />
        </div>

        {step === 0 && <BasicInfoFields values={values} errors={errors} onChange={onChange} categories={categories} />}
        {step === 1 && (
          <ProductImagesField
            mainImage={mainImage}
            gallery={gallery}
            onMainImageChange={setMainImage}
            onGalleryChange={setGallery}
            error={errors.mainImage ? t(`validation.${errors.mainImage}`) : undefined}
          />
        )}
        {step === 2 && <PricingFields values={values} errors={errors} onChange={onChange} />}
        {step === 3 && <InventoryFields values={values} errors={errors} onChange={onChange} />}
        {step === 4 && (
          <div className="flex flex-col gap-6">
            <SupplierField values={values} onChange={onChange} suppliers={suppliers} />
            <div className="rounded-md bg-gray-2 p-5 dark:bg-meta-4">
              <h3 className="mb-3 font-semibold text-black dark:text-white">{t('review')}</h3>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="inline text-body">{t('name')}</dt>
                  <dd className="inline font-medium">{values.name}</dd>
                </div>
                <div>
                  <dt className="inline text-body">{t('brand')}</dt>
                  <dd className="inline font-medium">{values.brandName}</dd>
                </div>
                <div>
                  <dt className="inline text-body">{t('category')}</dt>
                  <dd className="inline font-medium">{category?.name}</dd>
                </div>
                <div>
                  <dt className="inline text-body">{t('price')}</dt>
                  <dd className="inline font-medium">{values.price && formatVND(Number(values.price), locale)}</dd>
                </div>
                <div>
                  <dt className="inline text-body">{t('stock')}</dt>
                  <dd className="inline font-medium">{values.stock}</dd>
                </div>
                <div>
                  <dt className="inline text-body">{t('imageCount')}</dt>
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
            {t('exit')}
          </button>
          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={saving}
                className="rounded-md border border-stroke px-5 py-2 font-medium dark:border-strokedark"
              >
                {t('back')}
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
              >
                {t('next')}
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
              >
                {saving ? t('saving') : t('finish')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ProductCreate;
