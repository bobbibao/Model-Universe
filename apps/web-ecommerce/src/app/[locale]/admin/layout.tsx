import type { ReactNode } from 'react';
import DefaultLayout from '@/components/Layouts/DefaultLayout';

// Keep the navigation mounted across admin routes (scroll position, dropdowns and header).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <DefaultLayout>{children}</DefaultLayout>;
}
