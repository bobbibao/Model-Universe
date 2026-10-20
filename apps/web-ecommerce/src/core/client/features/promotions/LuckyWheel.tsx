'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

// Three calm tones alternating (ink, violet, paper) with one lime highlight; text colour follows the fill.
const SEGMENTS = [
  { fill: '#22212b', text: '#f8f8f3' },
  { fill: '#7956d8', text: '#ffffff' },
  { fill: '#f1efe7', text: '#22212b' },
  { fill: '#dcf56a', text: '#22212b' },
];

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
                  d={`M100 100 L${point(start, 96)} A96 96 0 0 1 ${point(end, 96)} Z`}
                  fill={SEGMENTS[index % SEGMENTS.length].fill}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                />
                <text
                  x="100"
                  y="34"
                  transform={`rotate(${start + slice / 2} 100 100)`}
                  textAnchor="middle"
                  fill={SEGMENTS[index % SEGMENTS.length].text}
                >
                  {label}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="98" fill="none" stroke="#22212b" strokeWidth="3" />
          <circle cx="100" cy="100" r="17" fill="#fff" stroke="#22212b" strokeWidth="2" />
        </svg>
      </div>
      <button type="button" className="lucky-wheel-button" disabled={disabled || spinning} onClick={() => void spin()}>
        {spinning ? t('spinning') : disabled ? t('spunToday') : t('spin')}
      </button>
    </div>
  );
}
