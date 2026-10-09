'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import ProductImage from './ProductImage';

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  depth?: boolean;
  children?: ReactNode;
}

// A perspective photograph, never a substitute for an actual 3D mesh or unseen product angles.
export default function ProductStage({ src, alt, className = '', sizes, priority, depth = true, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const enabled = useRef(false);
  const frame = useRef(0);
  useEffect(() => {
    const query = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const update = () => {
      enabled.current = depth && query.matches;
      root.current?.style.setProperty('--stage-x', '0deg');
      root.current?.style.setProperty('--stage-y', '0deg');
    };
    update();
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
      cancelAnimationFrame(frame.current);
    };
  }, [depth]);
  return (
    <div
      ref={root}
      className={`product-stage ${depth ? 'has-depth' : ''} ${className}`}
      onPointerMove={(event) => {
        if (!enabled.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -10;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          root.current?.style.setProperty('--stage-x', `${y}deg`);
          root.current?.style.setProperty('--stage-y', `${x}deg`);
        });
      }}
      onPointerLeave={() => {
        cancelAnimationFrame(frame.current);
        root.current?.style.setProperty('--stage-x', '0deg');
        root.current?.style.setProperty('--stage-y', '0deg');
      }}
    >
      <div className="product-stage-floor" aria-hidden="true" />
      <div className="product-stage-photo">
        <ProductImage src={src} alt={alt} priority={priority} sizes={sizes} className="object-contain" />
      </div>
      {children}
    </div>
  );
}
