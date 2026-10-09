'use client';

import { useEffect, useRef, useState } from 'react';

// Lazy, one-shot motion only after a verified successful operation.
export default function SuccessSignal() {
  const host = useRef<HTMLDivElement>(null), [animated,setAnimated] = useState(false);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let disposed = false;
    let animation: import('lottie-web').AnimationItem | undefined;
    void Promise.all([import('lottie-web'),fetch('/animations/collection-complete.json').then(response => {
      if (!response.ok) throw new Error('Success motion unavailable');
      return response.json();
    })]).then(([player,data]) => {
      if (disposed || !host.current) return;
      animation = player.default.loadAnimation({container:host.current,renderer:'svg',loop:false,autoplay:true,animationData:data});
      animation.addEventListener('DOMLoaded',() => { if (!disposed) setAnimated(true); });
    }).catch(() => { /* The static success symbol remains usable. */ });
    return () => { disposed = true; animation?.destroy(); };
  },[]);
  return <div className="relative mx-auto mb-4 h-20 w-20 rounded-full bg-cyan-100" aria-hidden="true"><div ref={host} className="absolute inset-0" />{!animated && <svg viewBox="0 0 80 80" className="h-full w-full"><path d="M20 40l14 14 28-29" fill="none" stroke="#126e78" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>;
}
