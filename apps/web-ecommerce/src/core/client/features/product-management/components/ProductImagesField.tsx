'use client';

import { useTranslations } from 'next-intl';
import { ChangeEvent } from 'react';
import ProductImage from '@/components/ProductImage';
import UploadApi from '@/core/client/api/Upload';

// An image that is either already stored (url) or selected locally and waiting to be uploaded (file).
export interface ImageItem {
  url?: string;
  file?: File;
  preview: string;
}

export const imageFromUrl = (url: string): ImageItem => ({ url, preview: url });

const imageFromFile = (file: File): ImageItem => ({ file, preview: URL.createObjectURL(file) });

// Uploads the pending files and returns the final URLs in the same order, or undefined if the upload failed.
export const uploadPendingImages = async (items: ImageItem[]): Promise<string[] | undefined> => {
  const pending = items.filter((item) => item.file).map((item) => item.file as File);
  const uploaded = pending.length > 0 ? await UploadApi.uploadImages(pending) : [];
  if (!uploaded) return undefined;
  let next = 0;
  return items.map((item) => (item.file ? uploaded[next++] : (item.url as string)));
};

const MAX_GALLERY_IMAGES = 10;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

interface ProductImagesFieldProps {
  mainImage: ImageItem | null;
  gallery: ImageItem[];
  onMainImageChange: (image: ImageItem | null) => void;
  onGalleryChange: (images: ImageItem[]) => void;
  error?: string;
}

const Thumbnail = ({ image, onRemove, label }: { image: ImageItem; onRemove: () => void; label: string }) => {
  const t = useTranslations('adminProducts');
  return (
    <div className="relative aspect-square w-32 overflow-hidden rounded border border-stroke bg-gray-2 dark:border-strokedark dark:bg-meta-4">
      <ProductImage src={image.preview} alt={label} sizes="128px" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('removeImage', { label })}
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-danger"
      >
        ×
      </button>
    </div>
  );
};

const pickerClassName =
  'flex aspect-square w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-stroke text-sm text-body hover:border-brand-hover hover:text-brand-hover dark:border-strokedark focus-within:outline focus-within:outline-2 focus-within:outline-brand-hover';

const ProductImagesField = ({
  mainImage,
  gallery,
  onMainImageChange,
  onGalleryChange,
  error,
}: ProductImagesFieldProps) => {
  const t = useTranslations('adminProducts');
  const handleMainImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onMainImageChange(imageFromFile(file));
    event.target.value = '';
  };

  const handleGallery = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, MAX_GALLERY_IMAGES - gallery.length);
    if (files.length > 0) onGalleryChange([...gallery, ...files.map(imageFromFile)]);
    event.target.value = '';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 font-medium text-black dark:text-white">{t('mainImage')}</p>
        <div className="flex flex-wrap items-center gap-4">
          {mainImage ? (
            <Thumbnail image={mainImage} label={t('mainImage')} onRemove={() => onMainImageChange(null)} />
          ) : (
            <label className={pickerClassName}>
              <span aria-hidden="true" className="text-2xl">+</span>
              {t('chooseImage')}
              <input type="file" accept={ACCEPT} aria-label={t(mainImage ? 'changeImage' : 'chooseImage')} className="sr-only" onChange={handleMainImage} />
            </label>
          )}
          {mainImage && (
            <label className="cursor-pointer font-medium text-brand-hover hover:underline">
              {t('changeImage')}
              <input type="file" accept={ACCEPT} className="hidden" onChange={handleMainImage} />
            </label>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
      <div>
        <p className="mb-3 font-medium text-black dark:text-white">
          {t('gallery', { count: gallery.length, max: MAX_GALLERY_IMAGES })}
        </p>
        <div className="flex flex-wrap gap-4">
          {gallery.map((image, index) => (
            <Thumbnail
              key={image.preview}
              image={image}
              label={t('galleryImage', { index: index + 1 })}
              onRemove={() => onGalleryChange(gallery.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
          {gallery.length < MAX_GALLERY_IMAGES && (
            <label className={pickerClassName}>
              <span aria-hidden="true" className="text-2xl">+</span>
              {t('addImage')}
              <input type="file" accept={ACCEPT} multiple aria-label={t('addImage')} className="sr-only" onChange={handleGallery} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductImagesField;
