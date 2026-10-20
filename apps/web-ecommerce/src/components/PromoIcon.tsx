// Line icons for offers and membership (24px grid, 1.75 stroke, currentColor), one visual language instead of emoji.
const PATHS = {
  ticket:
    'M3 9a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1Zm11-5v2m0 4v2m0 4v2',
  truck:
    'M3 6h11v10H3zM14 9h4l3 3.5V16h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4m-7.5 9 2 2 4-4',
  wheel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18v18M3 12h18M5.6 5.6l12.8 12.8m0-12.8L5.6 18.4',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7Z',
  crown: 'm3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5Zm2 11h14',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3-12.5c-.6-.9-1.7-1.5-3-1.5-1.9 0-3 1-3 2.3 0 3 6 1.6 6 4.6 0 1.3-1.2 2.4-3 2.4-1.4 0-2.6-.6-3.2-1.6M12 5.5v13',
  gift: 'M4 10h16v11H4zM3 7h18v3H3zm9 0v14M12 7S10.5 3 8 3a2 2 0 0 0 0 4m4 0s1.5-4 4-4a2 2 0 0 1 0 4',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  bag: 'M5 8h14l-1 13H6Zm4 0V6a3 3 0 0 1 6 0v2',
  star: 'm12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8Z',
  share:
    'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4m0-11-6.8 4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9.5v.5',
  lock: 'M6 11h12v10H6zm2.5 0V8a3.5 3.5 0 0 1 7 0v3',
  percent: 'm19 5-14 14M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  package: 'm12 3 8 4.5v9L12 21l-8-4.5v-9Zm0 9 8-4.5M12 12v9m0-9L4 7.5',
} as const;

export type PromoIconName = keyof typeof PATHS;

export default function PromoIcon({
  name,
  size = 20,
  className = '',
}: {
  name: PromoIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`promo-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
