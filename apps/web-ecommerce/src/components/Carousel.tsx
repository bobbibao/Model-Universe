'use client';

import { Children, useCallback, useEffect, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';

interface CarouselProps {
  children: ReactNode;
  label: string;
  // Slide width as a CSS length per breakpoint is set by the caller's class (`--slide` custom property).
  className?: string;
  autoplayMs?: number;
  loop?: boolean;
  dots?: boolean;
  arrows?: boolean;
  dragFree?: boolean;
}

// A swipeable carousel (Embla): arrows, dots, optional autoplay that pauses on hover/focus and stops after the visitor
// interacts, and nothing animated when the visitor prefers reduced motion.
export default function Carousel({
  children,
  label,
  className = '',
  autoplayMs,
  loop = false,
  dots = true,
  arrows = true,
  dragFree = false,
}: CarouselProps) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const [viewport, api] = useEmblaCarousel(
    { loop, align: 'start', dragFree, containScroll: 'trimSnaps' },
    autoplayMs && !reduced ? [Autoplay({ delay: autoplayMs, stopOnInteraction: true, stopOnMouseEnter: true })] : [],
  );
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const sync = useCallback(() => {
    if (!api) return;
    setSelected(api.selectedScrollSnap());
    setSnaps(api.scrollSnapList());
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, [api]);
  useEffect(() => {
    if (!api) return;
    sync();
    api.on('select', sync).on('reInit', sync);
    return () => {
      api.off('select', sync).off('reInit', sync);
    };
  }, [api, sync]);
  const slides = Children.toArray(children);
  return (
    <div className={`carousel ${className}`} role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="carousel-viewport" ref={viewport}>
        <div className="carousel-track">
          {slides.map((slide, index) => (
            <div
              className="carousel-slide"
              key={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slides.length}`}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>
      {arrows && snaps.length > 1 && (
        <>
          <button
            type="button"
            className="carousel-arrow is-prev"
            aria-label="Previous"
            disabled={!canPrev}
            onClick={() => api?.scrollPrev()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="carousel-arrow is-next"
            aria-label="Next"
            disabled={!canNext}
            onClick={() => api?.scrollNext()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </>
      )}
      {dots && snaps.length > 1 && (
        <div className="carousel-dots">
          {snaps.map((_, index) => (
            <button
              type="button"
              key={index}
              className={index === selected ? 'is-active' : ''}
              aria-label={`${index + 1}`}
              aria-current={index === selected}
              onClick={() => api?.scrollTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
