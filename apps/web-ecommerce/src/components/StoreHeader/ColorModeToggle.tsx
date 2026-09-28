'use client';

import useColorMode from '@/hooks/useColorMode';

const ColorModeToggle = ({ className = '' }: { className?: string }) => {
  const [colorMode, setColorMode] = useColorMode();
  const isDark = colorMode === 'dark';

  return (
    <button
      className={className}
      onClick={() => typeof setColorMode === 'function' && setColorMode(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
    >
      {isDark ? (
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm0-5a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1Zm0 18a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0v-1a1 1 0 0 1 1-1ZM3 11h1a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2Zm17 0h1a1 1 0 0 1 0 2h-1a1 1 0 0 1 0-2ZM5.64 4.22l.7.71a1 1 0 0 1-1.41 1.41l-.71-.7a1 1 0 0 1 1.42-1.42Zm12.72 12.73.71.7a1 1 0 0 1-1.42 1.42l-.7-.71a1 1 0 0 1 1.41-1.41Zm1.42-12.73a1 1 0 0 1 0 1.42l-.71.7a1 1 0 1 1-1.41-1.41l.7-.71a1 1 0 0 1 1.42 0ZM6.34 17.66l-.7.71a1 1 0 0 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 1.41Z" />
        </svg>
      ) : (
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21.64 13a1 1 0 0 0-1.05-.14 8.05 8.05 0 0 1-3.37.73 8.15 8.15 0 0 1-8.14-8.1 8.59 8.59 0 0 1 .25-2A1 1 0 0 0 8 2.36a10.14 10.14 0 1 0 14 11.69 1 1 0 0 0-.36-1.05Z" />
        </svg>
      )}
    </button>
  );
};

export default ColorModeToggle;
