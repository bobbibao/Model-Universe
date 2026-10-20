'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const COLORS = ['#6d45d6', '#f0412a', '#0f9f95', '#ff8a1f', '#3b2580', '#d6f36b', '#1f1b2d'];

// The daily lucky wheel: segments drawn in SVG, a spin that lands on the prize the server drew (the wheel never decides).
export default function LuckyWheel({
  prizes,
  disabled,
  onSpin,
}: {
  prizes: string[];
  disabled: boolean;
  onSpin: () => Promise<number | null>;
}) {
  const t = useTranslations('promotions');
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const slice = 360 / Math.max(1, prizes.length);
  const spin = async () => {
    setSpinning(true);
    const index = await onSpin();
    if (index === null) {
      setSpinning(false);
      return;
    }
    // Five full turns, then stop with the prize's segment under the pointer at the top.
    const target = 360 * 5 + (360 - (index * slice + slice / 2));
    setAngle((current) => current - (current % 360) + target);
    window.setTimeout(() => setSpinning(false), 4200);
  };
  const point = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${100 + radius * Math.cos(rad)} ${100 + radius * Math.sin(rad)}`;
  };
  return (
    <div className="lucky-wheel">
      <div className="lucky-wheel-dial">
        <span className="lucky-wheel-pointer" aria-hidden="true" />
        <svg viewBox="0 0 200 200" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
          {prizes.map((label, index) => {
            const start = index * slice,
              end = start + slice;
            return (
              <g key={label + index}>
                <path
                  d={`M100 100 L${point(start, 98)} A98 98 0 0 1 ${point(end, 98)} Z`}
                  fill={COLORS[index % COLORS.length]}
                />
                <text
                  x="100"
                  y="30"
                  transform={`rotate(${start + slice / 2} 100 100)`}
                  textAnchor="middle"
                  className={COLORS[index % COLORS.length] === '#d6f36b' ? 'is-dark' : ''}
                >
                  {label}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="16" fill="#fff" />
        </svg>
      </div>
      <button type="button" className="lucky-wheel-button" disabled={disabled || spinning} onClick={() => void spin()}>
        {spinning ? t('spinning') : disabled ? t('spunToday') : t('spin')}
      </button>
    </div>
  );
}
