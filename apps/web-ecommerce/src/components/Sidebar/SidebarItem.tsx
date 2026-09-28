import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useLocalStorage from '@/hooks/useLocalStorage';

export interface SidebarMenuChild {
  label: string;
  route: string;
}

export interface SidebarMenuItem {
  icon?: React.ReactNode;
  label: string;
  route: string;
  children?: SidebarMenuChild[];
}

interface SidebarItemProps {
  item: SidebarMenuItem;
  pageName: string;
  setPageName: (pageName: string) => void;
}

// A route is active for its own path and any nested path (e.g. /admin/products/12).
const isRouteActive = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

const SidebarItem = ({ item, setPageName }: SidebarItemProps) => {
  const pathname = usePathname();
  const isChildActive = !!item.children?.some((child) => isRouteActive(pathname, child.route));
  // Use the item's label as a unique identifier for localStorage
  const storageKey = `sidebar-${item.label.toLowerCase()}-expanded`;
  const [storedOpen, setIsOpen] = useLocalStorage(storageKey, false);
  // Keep the dropdown open while one of its children is the current page
  const isOpen = storedOpen || isChildActive;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const isActive = isRouteActive(pathname, item.route) || isChildActive;

  return (
    <li>
      {item.children ? (
        <>
          <div className="relative flex items-center">
            <Link
              href={item.route}
              className={`group flex flex-grow items-center gap-2.5 rounded-sm px-4 py-2 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                isActive ? 'bg-graydark text-brand dark:bg-meta-4' : ''
              }`}
              onClick={() => setPageName(item.label.toLowerCase())}
            >
              {item.icon}
              {item.label}
            </Link>
            <button className="absolute right-4 top-1/2 -translate-y-1/2 p-1" onClick={handleToggle}>
              <span
                className={`block transform fill-current ${isOpen ? 'rotate-180' : ''} transition-transform duration-300`}
              >
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M1.41 0.590027L6 5.17003L10.59 0.590027L12 2.00003L6 8.00003L0 2.00003L1.41 0.590027Z"
                    fill="currentColor"
                  ></path>
                </svg>
              </span>
            </button>
          </div>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
            <ul className="mb-2 mt-2 pl-6">
              {item.children.map((child) => {
                const childActive = isRouteActive(pathname, child.route);
                return (
                  <li key={child.route}>
                    <Link
                      href={child.route}
                      className={`group flex items-center gap-2.5 rounded-sm px-4 py-2 font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                        childActive ? 'text-brand' : ''
                      }`}
                      onClick={() => setPageName(child.label.toLowerCase())}
                    >
                      {child.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : (
        <Link
          href={item.route}
          className={`group flex items-center gap-2.5 rounded-sm px-4 py-2 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
            isActive ? 'bg-graydark text-brand dark:bg-meta-4' : ''
          }`}
          onClick={() => setPageName(item.label.toLowerCase())}
        >
          {item.icon}
          {item.label}
        </Link>
      )}
    </li>
  );
};

export default SidebarItem;
