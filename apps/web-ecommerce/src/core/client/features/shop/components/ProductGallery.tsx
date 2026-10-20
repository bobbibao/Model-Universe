'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ProductImage from '@/components/ProductImage';
import ProductStage from '@/components/ProductStage';
import AdminIcon from '@/components/Admin/AdminIcon';

const ProductGallery = ({ images, alt }: { images: string[]; alt: string }) => {
  const t = useTranslations('catalog');
  const [current, setCurrent] = useState(0);
  const experience = useTranslations('experience');

  const imageKey = images.join('|');
  useEffect(() => setCurrent(0), [imageKey]);

  return (
    <div className="studio-gallery flex flex-col gap-4">
      <div className="studio-gallery-toolbar">
        <span>
          <AdminIcon name="box" size={16} />
          {experience('actualPhotos')}
        </span>
      </div>
      <ProductStage
        src={images[current]}
        alt={alt}
        className="studio-detail-stage"
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
      />
      <div className="studio-gallery-controls">
        <span>{experience('photoPosition', { current: current + 1, count: images.length })}</span>
        {images.length > 1 && (
          <div>
            <button
              type="button"
              aria-label={experience('previousPhoto')}
              onClick={() => setCurrent((index) => (index + images.length - 1) % images.length)}
            >
              ←
            </button>
            <button
              type="button"
              aria-label={experience('nextPhoto')}
              onClick={() => setCurrent((index) => (index + 1) % images.length)}
            >
              →
            </button>
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-3">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              onClick={() => setCurrent(index)}
              aria-label={t('photo', { number: index + 1 })}
              aria-pressed={index === current}
              className={`relative aspect-square overflow-hidden rounded border-2 bg-gray-2 dark:bg-store-card ${
                index === current ? 'border-brand-hover' : 'border-transparent'
              }`}
            >
              <ProductImage src={image} alt="" sizes="120px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductGallery;
