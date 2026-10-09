'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AdminAssistant from '@/components/Admin/AdminAssistant';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname(),
    t = useTranslations('adminWorkspace');
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const menuTrigger = document.querySelector<HTMLButtonElement>('.admin-menu-trigger');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const sidebar = document.getElementById('sidebar');
    const controls = () =>
      Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href],button') ?? []).filter(
        (element) => element.getClientRects().length > 0,
      );
    // Wait for the drawer's visibility style to be applied before transferring focus.
    const focusFrame = requestAnimationFrame(() => controls()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
      if (event.key !== 'Tab') return;
      const elements = controls(),
        first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const breakpoint = matchMedia('(min-width: 1024px)');
    const resize = () => {
      if (breakpoint.matches) setSidebarOpen(false);
    };
    document.addEventListener('keydown', keydown);
    breakpoint.addEventListener('change', resize);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      breakpoint.removeEventListener('change', resize);
      menuTrigger?.focus();
    };
  }, [sidebarOpen]);
  return (
    <div className="mu-operations admin-workspace">
      <a className="admin-skip-link" href="#admin-main">
        {t('skipContent')}
      </a>
      {sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label={t('closeNavigation')}
          tabIndex={-1}
        />
      )}
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="admin-workspace-body" inert={sidebarOpen}>
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main id="admin-main" tabIndex={-1} className="admin-main">
          <div className="admin-page">{children}</div>
        </main>
        <AdminAssistant />
      </div>
    </div>
  );
}
