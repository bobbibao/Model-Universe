'use client';

import { useEffect, useState } from 'react';
import ProductImage from '@/components/ProductImage';

const ProductGallery = ({ images, alt }: { images: string[]; alt: string }) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => setCurrent(0), [images]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-gray-2 dark:bg-store-card">
        <ProductImage src={images[current]} alt={alt} priority sizes="(min-width: 1024px) 50vw, 100vw" />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-3">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              onClick={() => setCurrent(index)}
              aria-label={`Ảnh ${index + 1}`}
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
