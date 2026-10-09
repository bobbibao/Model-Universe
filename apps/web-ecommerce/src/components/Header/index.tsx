'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/i18n/navigation';
import DarkModeSwitcher from './DarkModeSwitcher';
import DropdownUser from './DropdownUser';
import AgentInboxBadge from '@/core/client/features/agent-console/components/AgentInboxBadge';
import AdminCommandMenu from '@/components/Admin/AdminCommandMenu';
import AdminIcon from '@/components/Admin/AdminIcon';
import { adminDestination } from '@/components/Admin/navigation';

export default function Header({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const locale = useLocale(),
    t = useTranslations('adminNavigation'),
    workspace = useTranslations('adminWorkspace');
  const pathname = usePathname(),
    search = useSearchParams(),
    destination = adminDestination(pathname);
  const switchHref = search.size ? `${pathname}?${search.toString()}` : pathname;
  return (
    <header className="admin-header">
      <div className="admin-header-location">
        <button
          type="button"
          aria-controls="sidebar"
          aria-label={t('menu')}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="admin-menu-trigger"
        >
          <AdminIcon name="menu" />
        </button>
        <div className="admin-location">
          <span>{workspace('workspace')}</span>
          <strong>{destination ? t(destination.label) : workspace('workspace')}</strong>
        </div>
      </div>
      <div className="admin-header-actions">
        <AdminCommandMenu />
        <ul className="admin-header-tools">
          <li>
            <a
              href={`/${locale === 'vi' ? 'en' : 'vi'}${switchHref}`}
              aria-label={locale === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
              className="admin-language"
            >
              {locale === 'vi' ? 'EN' : 'VI'}
            </a>
          </li>
          <DarkModeSwitcher />
          <li>
            <AgentInboxBadge />
          </li>
        </ul>
        <DropdownUser />
      </div>
    </header>
  );
}
