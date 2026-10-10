'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';

/** A floating handle for the native document scroll; it never intercepts wheel or touch. */
export default function BrandedScrollbar() {
  const locale = useLocale();
  const rail = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const geometry = useRef({ travel: 0, max: 0 });
  const drag = useRef<{ pointer: number; startY: number; startScroll: number } | undefined>(undefined);

  useEffect(() => {
    const element = rail.current!;
    const handle = thumb.current!;
    const root = document.documentElement;
    const media = matchMedia('(hover: hover) and (pointer: fine) and (forced-colors: none)');
    let frame = 0;
    let hide: ReturnType<typeof setTimeout>;
    const activeContainers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const measure = () => {
      frame = 0;
      if (!media.matches) return;
      const max = Math.max(0, root.scrollHeight - innerHeight);
      const height = element.clientHeight;
      const size = Math.min(height, Math.max(48, (height * innerHeight) / Math.max(innerHeight, root.scrollHeight)));
      geometry.current = { max, travel: Math.max(0, height - size) };
      handle.style.height = `${size}px`;
      handle.style.transform = `translateY(${max ? Math.min(1, Math.max(0, scrollY / max)) * geometry.current.travel : 0}px)`;
      const locked =
        getComputedStyle(document.body).overflowY === 'hidden' || getComputedStyle(root).overflowY === 'hidden';
      element.dataset.overflow = String(max > 0 && !locked);
      element.setAttribute('aria-valuenow', String(Math.round(max ? (scrollY / max) * 100 : 0)));
    };
    const requestMeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const enable = () => {
      root.classList.toggle('has-floating-scrollbar', media.matches);
      element.hidden = !media.matches;
      requestMeasure();
    };
    const onScroll = (event: Event) => {
      if (!media.matches) return;
      const target = event.target;
      if (target === document) {
        element.dataset.active = 'true';
        clearTimeout(hide);
        hide = setTimeout(() => {
          element.dataset.active = 'false';
        }, 1100);
        requestMeasure();
      } else if (target instanceof HTMLElement) {
        target.dataset.scrolling = 'true';
        clearTimeout(activeContainers.get(target));
        activeContainers.set(
          target,
          setTimeout(() => {
            delete target.dataset.scrolling;
            activeContainers.delete(target);
          }, 1100),
        );
      }
    };
    const resize = new ResizeObserver(requestMeasure);
    resize.observe(document.body);
    const locks = new MutationObserver(requestMeasure);
    locks.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    locks.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    media.addEventListener('change', enable);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', requestMeasure, { passive: true });
    enable();
    return () => {
      root.classList.remove('has-floating-scrollbar');
      resize.disconnect();
      locks.disconnect();
      media.removeEventListener('change', enable);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', requestMeasure);
      cancelAnimationFrame(frame);
      clearTimeout(hide);
      for (const [container, timer] of activeContainers) {
        clearTimeout(timer);
        delete container.dataset.scrolling;
      }
    };
  }, []);

  const moveTo = (top: number) => window.scrollTo({ top, behavior: 'instant' });
  return (
    <div
      ref={rail}
      className="mu-floating-scrollbar"
      hidden
      role="scrollbar"
      aria-label={locale === 'vi' ? 'Cuộn trang' : 'Scroll page'}
      aria-controls="workspace-page"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      tabIndex={0}
      onKeyDown={(event) => {
        const offsets: Record<string, number> = {
          ArrowDown: 80,
          ArrowUp: -80,
          PageDown: innerHeight * 0.8,
          PageUp: -innerHeight * 0.8,
        };
        if (event.key === 'Home' || event.key === 'End' || event.key in offsets) {
          event.preventDefault();
          moveTo(event.key === 'Home' ? 0 : event.key === 'End' ? geometry.current.max : scrollY + offsets[event.key]);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const handle = thumb.current!;
        if (event.target !== handle) {
          const position = event.clientY - event.currentTarget.getBoundingClientRect().top - handle.clientHeight / 2;
          moveTo(geometry.current.travel ? (position / geometry.current.travel) * geometry.current.max : 0);
        }
        drag.current = { pointer: event.pointerId, startY: event.clientY, startScroll: scrollY };
        event.currentTarget.dataset.dragging = 'true';
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        moveTo(
          current.startScroll +
            ((event.clientY - current.startY) / Math.max(1, geometry.current.travel)) * geometry.current.max,
        );
      }}
      onLostPointerCapture={() => {
        drag.current = undefined;
        if (rail.current) rail.current.dataset.dragging = 'false';
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <div ref={thumb} className="mu-floating-scrollbar-thumb" />
    </div>
  );
}
