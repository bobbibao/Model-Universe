'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export const PRODUCT_IMAGE_PLACEHOLDER = '/images/store/product-placeholder.svg';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

// Fills its (relatively positioned) parent. Images are not optimized by Next.js: uploads are served by the
// Express server (outside Next's image loader) and the seed catalog's CDN refuses server-side requests.
// A placeholder is shown when an image cannot be loaded.
const ProductImage = ({ src, alt, className = 'object-cover', sizes, priority }: ProductImageProps) => {
  const [currentSrc, setCurrentSrc] = useState(src || PRODUCT_IMAGE_PLACEHOLDER);

  useEffect(() => {
    setCurrentSrc(src || PRODUCT_IMAGE_PLACEHOLDER);
  }, [src]);

  return (
    <Image
      src={currentSrc}
      alt={alt}
      fill
      unoptimized
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setCurrentSrc(PRODUCT_IMAGE_PLACEHOLDER)}
    />
  );
};

export default ProductImage;
