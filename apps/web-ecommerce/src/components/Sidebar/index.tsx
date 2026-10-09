'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import SidebarItem, { SidebarMenuItem } from '@/components/Sidebar/SidebarItem';
import ClickOutside from '@/components/ClickOutside';
import BrandLogo from '@/components/BrandLogo';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const menuGroups: { name: string; menuItems: SidebarMenuItem[] }[] = [
  {
    name: 'overview',
    menuItems: [
      { icon: <DashboardIcon />, label: 'dashboard', route: '/admin/dashboard' },
      {
        icon: <ChartIcon />,
        label: 'charts',
        route: '/admin/charts/bar',
        children: [
          { label: 'bar', route: '/admin/charts/bar' },
          { label: 'pie', route: '/admin/charts/pie' },
          { label: 'line', route: '/admin/charts/line' },
        ],
      },
    ],
  },
  {
    name: 'operations',
    menuItems: [
      {
        icon: <ProductIcon />,
        label: 'products',
        route: '/admin/products',
        children: [
          { label: 'catalog', route: '/admin/products' },
          { label: 'categories', route: '/admin/categories' },
          { label: 'stock', route: '/admin/stock' },
          { label: 'coupons', route: '/admin/coupons' },
        ],
      },
      { icon: <OrderIcon />, label: 'membership', route: '/admin/loyalty' },
      { icon: <OrderIcon />, label: 'reservations', route: '/admin/reservations' },
      { icon: <OrderIcon />, label: 'buyback', route: '/admin/buyback' },
      { icon: <OrderIcon />, label: 'pawn', route: '/admin/pawn' },
      { icon: <OrderIcon />, label: 'partners', route: '/admin/partners' },
      { icon: <ProductIcon />, label: 'partnerListings', route: '/admin/partner-listings' },
      { icon: <CaseIcon />, label: 'policies', route: '/admin/commerce/policies' },
      { icon: <SupplierIcon />, label: 'suppliers', route: '/admin/suppliers' },
      {
        icon: <OrderIcon />,
        label: 'orders',
        route: '/admin/orders',
        children: [
          { label: 'orderList', route: '/admin/orders' },
          { label: 'support', route: '/admin/returns' },
        ],
      },
      {
        icon: <CustomerIcon />,
        label: 'customersContact',
        route: '/admin/customers',
        children: [
          { label: 'customers', route: '/admin/customers' },
          { label: 'contacts', route: '/admin/contacts' },
        ],
      },
    ],
  },
  {
    name: 'marketing',
    menuItems: [{ icon: <ChartIcon />, label: 'adminCampaigns', route: '/admin/marketing' }],
  },
  {
    name: 'agent',
    menuItems: [
      {
        icon: <ImprovementIcon />,
        label: 'approvalsWork',
        route: '/admin/agent/inbox',
        activeRoutes: ['/admin/agent/threads'],
        children: [
          { label: 'inbox', route: '/admin/agent/inbox' },
          { label: 'copilot', route: '/admin/agent/copilot' },
          { label: 'tasks', route: '/admin/agent/tasks' },
          { label: 'activity', route: '/admin/agent/activity' },
        ],
      },
      {
        icon: <ChartIcon />,
        label: 'growthImpact',
        route: '/admin/agent/growth',
        children: [
          { label: 'growth', route: '/admin/agent/growth' },
          { label: 'campaigns', route: '/admin/agent/campaigns' },
          { label: 'market', route: '/admin/agent/market' },
          { label: 'impact', route: '/admin/agent/impact' },
        ],
      },
      {
        icon: <CaseIcon />,
        label: 'knowledgeGovernance',
        route: '/admin/agent/knowledge',
        children: [
          { label: 'knowledge', route: '/admin/agent/knowledge' },
          { label: 'audit', route: '/admin/agent/audit' },
          { label: 'settings', route: '/admin/agent/settings' },
        ],
      },
    ],
  },
];

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const t = useTranslations('adminNavigation');
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <ClickOutside onClick={() => setSidebarOpen(false)}>
      <aside
        id="sidebar"
        className={`fixed left-0 top-0 z-9999 flex h-screen w-72.5 flex-col overflow-y-hidden bg-black duration-300 ease-linear dark:bg-boxdark lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-6 py-5.5 lg:py-6.5">
          <BrandLogo href="/admin/dashboard" />
          <button
            onClick={handleToggle}
            aria-controls="sidebar"
            aria-label={t('closeMenu')}
            className="block text-bodydark1 lg:hidden"
          >
            <ToggleIcon />
          </button>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <nav aria-label={t('menu')} className="mt-5 px-4 py-4 lg:mt-9 lg:px-6">
            {menuGroups.map((group) => (
              <div key={group.name}>
                <h3 className="mb-4 ml-4 text-sm font-semibold text-bodydark2">{t(group.name)}</h3>
                <ul className="mb-6 flex flex-col gap-1.5">
                  {group.menuItems.map((menuItem) => (
                    <SidebarItem
                      key={menuItem.label}
                      item={{
                        ...menuItem,
                        label: t(menuItem.label),
                        children: menuItem.children?.map((child) => ({ ...child, label: t(child.label) })),
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </ClickOutside>
  );
};

function DashboardIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9.2h3V19H5V9.2ZM10.6 5h2.8v14h-2.8V5Zm5.6 8H19v6h-2.8v-6Z" />
    </svg>
  );
}

function ProductIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.24L18.53 7.5 12 10.76 5.47 7.5 12 4.24ZM5 9.12l6 3v7.64l-6-3V9.12Zm8 10.64v-7.64l6-3v7.64l-6 3Z" />
    </svg>
  );
}

function SupplierIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 8h-3V4H3a2 2 0 0 0-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4ZM6 18.5A1.5 1.5 0 1 1 7.5 17 1.5 1.5 0 0 1 6 18.5Zm13.5-9 1.96 2.5H17V9.5h2.5Zm-1.5 9a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5Z" />
    </svg>
  );
}

function OrderIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 3h-4.18A3 3 0 0 0 12 1a3 3 0 0 0-2.82 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-7 0a1 1 0 1 1-1 1 1 1 0 0 1 1-1Zm2 14H7v-2h7v2Zm3-4H7v-2h10v2Zm0-4H7V7h10v2Z" />
    </svg>
  );
}

function CustomerIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05A4.22 4.22 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z" />
    </svg>
  );
}

function ImprovementIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 21h6v-1H9v1Zm3-20a7 7 0 0 0-4 12.74V16a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 1Zm2.85 11.1-.85.6V15h-4v-2.3l-.85-.6A5 5 0 1 1 14.85 12.1Z" />
    </svg>
  );
}

function CaseIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM9 4h2v5l-1-.75L9 9V4Zm9 16H6V4h1v9l3-2.25L13 13V4h5v16Z" />
    </svg>
  );
}

function ToggleIcon() {
  return (
    <svg
      className="fill-current"
      width="20"
      height="18"
      viewBox="0 0 20 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19 8.175H2.98748L9.36248 1.6875C9.69998 1.35 9.69998 0.825 9.36248 0.4875C9.02498 0.15 8.49998 0.15 8.16248 0.4875L0.399976 8.3625C0.0624756 8.7 0.0624756 9.225 0.399976 9.5625L8.16248 17.4375C8.31248 17.5875 8.53748 17.7 8.76248 17.7C8.98748 17.7 9.17498 17.625 9.36248 17.475C9.69998 17.1375 9.69998 16.6125 9.36248 16.275L3.02498 9.8625H19C19.45 9.8625 19.825 9.4875 19.825 9.0375C19.825 8.55 19.45 8.175 19 8.175Z"
        fill=""
      />
    </svg>
  );
}

export default Sidebar;
