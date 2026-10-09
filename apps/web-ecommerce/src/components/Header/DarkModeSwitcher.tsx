'use client';

import { useTranslations } from 'next-intl';
import useColorMode from '@/hooks/useColorMode';
import AdminIcon from '@/components/Admin/AdminIcon';

export default function DarkModeSwitcher() {
  const [colorMode, setColorMode] = useColorMode(),
    t = useTranslations('adminWorkspace');
  const dark = colorMode === 'dark';
  return (
    <li>
      <button
        type="button"
        className="admin-theme-toggle"
        aria-label={t(dark ? 'lightMode' : 'darkMode')}
        aria-pressed={dark}
        onClick={() => {
          if (typeof setColorMode === 'function') setColorMode(dark ? 'light' : 'dark');
        }}
      >
        <AdminIcon name={dark ? 'sun' : 'moon'} size={18} />
      </button>
    </li>
  );
}
