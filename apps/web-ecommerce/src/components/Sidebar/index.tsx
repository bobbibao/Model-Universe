'use client';

import React from 'react';
import SidebarItem, { SidebarMenuItem } from '@/components/Sidebar/SidebarItem';
import ClickOutside from '@/components/ClickOutside';
import BrandLogo from '@/components/BrandLogo';
import useLocalStorage from '@/hooks/useLocalStorage';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const menuGroups: { name: string; menuItems: SidebarMenuItem[] }[] = [
  {
    name: 'TỔNG QUAN',
    menuItems: [
      { icon: <DashboardIcon />, label: 'Dashboard', route: '/admin/dashboard' },
      {
        icon: <ChartIcon />,
        label: 'Biểu đồ',
        route: '/admin/charts/bar',
        children: [
          { label: 'Bar', route: '/admin/charts/bar' },
          { label: 'Pie', route: '/admin/charts/pie' },
          { label: 'Line', route: '/admin/charts/line' },
        ],
      },
    ],
  },
  {
    name: 'QUẢN LÝ',
    menuItems: [
      {
        icon: <ProductIcon />,
        label: 'Sản phẩm',
        route: '/admin/products',
        children: [
          { label: 'Danh sách sản phẩm', route: '/admin/products' },
          { label: 'Danh mục', route: '/admin/categories' },
          { label: 'Nhập kho', route: '/admin/stock' },
          { label: 'Khuyến mãi', route: '/admin/coupons' },
        ],
      },
      { icon: <SupplierIcon />, label: 'Nhà cung cấp', route: '/admin/suppliers' },
      { icon: <OrderIcon />, label: 'Đơn hàng', route: '/admin/orders' },
      { icon: <ReturnIcon />, label: 'Trả hàng', route: '/admin/returns' },
      { icon: <CustomerIcon />, label: 'Khách hàng', route: '/admin/customers' },
      { icon: <ContactIcon />, label: 'Liên hệ', route: '/admin/contacts' },
    ],
  },
  {
    name: 'TÁC TỬ AI',
    menuItems: [
      { icon: <ImprovementIcon />, label: 'Hộp duyệt', route: '/admin/agent/inbox' },
      { icon: <ChartIcon />, label: 'Hoạt động', route: '/admin/agent/activity' },
      { icon: <ChartIcon />, label: 'Hiệu quả cải tiến', route: '/admin/agent/impact' },
      { icon: <ChartIcon />, label: 'Kết quả tăng trưởng', route: '/admin/agent/growth' },
      { icon: <CaseIcon />, label: 'Tri thức', route: '/admin/agent/knowledge' },
      { icon: <TaskIcon />, label: 'Công việc từ tác tử', route: '/admin/agent/tasks' },
      { icon: <ChartIcon />, label: 'Chiến dịch của tác tử', route: '/admin/agent/campaigns' },
      { icon: <ChartIcon />, label: 'Dữ liệu thị trường', route: '/admin/agent/market' },
      { icon: <TaskIcon />, label: 'Nhật ký tác tử', route: '/admin/agent/audit' },
      { icon: <ImprovementIcon />, label: 'Cài đặt tác tử', route: '/admin/agent/settings' },
    ],
  },
];

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const [pageName, setPageName] = useLocalStorage('selectedMenu', 'dashboard');

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <ClickOutside onClick={() => setSidebarOpen(false)}>
      <aside
        className={`fixed left-0 top-0 z-9999 flex h-screen w-72.5 flex-col overflow-y-hidden bg-black duration-300 ease-linear dark:bg-boxdark lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-6 py-5.5 lg:py-6.5">
          <BrandLogo href="/admin/dashboard" />
          <button onClick={handleToggle} aria-controls="sidebar" className="block text-bodydark1 lg:hidden">
            <ToggleIcon />
          </button>
        </div>

        <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
          <nav className="mt-5 px-4 py-4 lg:mt-9 lg:px-6">
            {menuGroups.map((group) => (
              <div key={group.name}>
                <h3 className="mb-4 ml-4 text-sm font-semibold text-bodydark2">{group.name}</h3>
                <ul className="mb-6 flex flex-col gap-1.5">
                  {group.menuItems.map((menuItem) => (
                    <SidebarItem key={menuItem.label} item={menuItem} pageName={pageName} setPageName={setPageName} />
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

function ReturnIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z" />
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

function ContactIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z" />
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

function TaskIcon() {
  return (
    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9Z" />
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
