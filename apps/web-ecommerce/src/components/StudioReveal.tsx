'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export default function StudioReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    // Content remains visible if motion is disabled or the optional animation chunk fails to load.
    if (!matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    void import('gsap')
      .then(({ gsap }) => {
        if (disposed || !root.current) return;
        const media = gsap.matchMedia();
        media.add(
          '(prefers-reduced-motion: no-preference)',
          () => {
            gsap.from(root.current!.querySelectorAll('[data-reveal]'), {
              y: 22,
              opacity: 0,
              duration: 0.65,
              stagger: 0.07,
              ease: 'power2.out',
              clearProps: 'transform,opacity',
            });
          },
          root.current,
        );
        cleanup = () => media.revert();
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
