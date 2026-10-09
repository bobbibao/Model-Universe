'use client';

import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import SidebarItem from './SidebarItem';
import BrandLogo from '@/components/BrandLogo';
import AdminIcon from '@/components/Admin/AdminIcon';
import { adminNavigation } from '@/components/Admin/navigation';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function Sidebar({ sidebarOpen, setSidebarOpen }: SidebarProps) {
  const t = useTranslations('adminNavigation'),
    workspace = useTranslations('adminWorkspace');
  return (
    <aside id="sidebar" className={`admin-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="admin-sidebar-brand">
        <div>
          <BrandLogo href="/admin/dashboard" />
          <span className="admin-brand-caption">{workspace('workspace')}</span>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label={t('closeMenu')}
          className="admin-sidebar-close"
        >
          <AdminIcon name="close" />
        </button>
      </div>
      <div className="admin-sidebar-scroll">
        <nav
          aria-label={t('menu')}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setSidebarOpen(false);
          }}
        >
          {adminNavigation.map((group) => (
            <div key={group.name} className="admin-nav-group">
              <h3>{t(group.name)}</h3>
              <ul>
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.label}
                    item={{
                      ...item,
                      icon: <AdminIcon name={item.icon} size={18} />,
                      label: t(item.label),
                      children:
                        'children' in item
                          ? item.children?.map((child) => ({ ...child, label: t(child.label) }))
                          : undefined,
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <Link href="/" className="admin-store-link">
          <AdminIcon name="box" size={18} />
          {t('store')}
          <AdminIcon name="arrow" size={16} />
        </Link>
      </div>
    </aside>
  );
}
