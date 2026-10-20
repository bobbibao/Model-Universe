import type { ReactNode } from 'react';
import ProductImage from './ProductImage';

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  children?: ReactNode;
}

// Actual photographs, presented flat without simulated depth or pointer-driven angles.
export default function ProductStage({ src, alt, className = '', sizes, priority, children }: Props) {
  return (
    <div className={`product-stage ${className}`}>
      <div className="product-stage-photo">
        <ProductImage src={src} alt={alt} priority={priority} sizes={sizes} className="object-contain" />
      </div>
      {children}
    </div>
  );
}
