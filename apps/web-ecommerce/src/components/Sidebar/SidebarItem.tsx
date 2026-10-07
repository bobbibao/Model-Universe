'use client';

import React, { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SidebarMenuChild {
  label: string;
  route: string;
}

export interface SidebarMenuItem {
  icon?: React.ReactNode;
  label: string;
  route: string;
  children?: SidebarMenuChild[];
  activeRoutes?: string[];
}

const isRouteActive = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

const SidebarItem = ({ item }: { item: SidebarMenuItem }) => {
  const pathname = usePathname();
  const submenuId = useId();
  const isActive = isRouteActive(pathname, item.route)
    || !!item.children?.some((child) => isRouteActive(pathname, child.route))
    || !!item.activeRoutes?.some((route) => isRouteActive(pathname, route));
  const storageKey = `sidebar-${item.route}-expanded`;
  const [isOpen, setIsOpen] = useState(isActive);

  useEffect(() => {
    if (!item.children) return;
    try {
      if (isActive) {
        setIsOpen(true);
        window.localStorage.setItem(storageKey, 'true');
      } else if (window.localStorage.getItem(storageKey) === 'true') {
        setIsOpen(true);
      }
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, [pathname, isActive, storageKey, item.children]);

  const toggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    try {
      window.localStorage.setItem(storageKey, String(nextOpen));
    } catch {
      // Keep the in-memory dropdown state.
    }
  };

  const itemClass = `group flex w-full items-center gap-2.5 rounded-sm px-4 py-2 text-left font-medium text-bodydark1 transition-colors hover:bg-graydark dark:hover:bg-meta-4 ${
    isActive ? 'bg-graydark text-brand dark:bg-meta-4' : ''
  }`;

  return (
    <li>
      {item.children ? (
        <>
          <button type="button" className={itemClass} onClick={toggle} aria-expanded={isOpen} aria-controls={submenuId}>
            {item.icon}
            <span className="flex-1">{item.label}</span>
            <svg className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
              <path d="M1.41 0.59L6 5.17L10.59 0.59L12 2L6 8L0 2L1.41 0.59Z" fill="currentColor" />
            </svg>
          </button>
          <ul id={submenuId} hidden={!isOpen} className="mb-2 mt-2 pl-6">
            {item.children.map((child) => {
              const childActive = isRouteActive(pathname, child.route);
              return (
                <li key={child.route}>
                  <Link href={child.route} aria-current={childActive ? 'page' : undefined}
                    className={`group flex items-center gap-2.5 rounded-sm px-4 py-2 font-medium transition-colors hover:text-white ${childActive ? 'text-brand' : 'text-bodydark2'}`}>
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <Link href={item.route} className={itemClass} aria-current={isActive ? 'page' : undefined}>
          {item.icon}
          {item.label}
        </Link>
      )}
    </li>
  );
};

export default SidebarItem;
