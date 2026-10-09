'use client';

import { useTranslations } from 'next-intl';
import Link, { usePathname } from '@/i18n/navigation';
import { adminDestination } from '@/components/Admin/navigation';

export default function Breadcrumb({ pageName }: { pageName: string }) {
  const t = useTranslations('adminWorkspace'),
    navigation = useTranslations('adminNavigation');
  const destination = adminDestination(usePathname());
  return (
    <div className="admin-page-heading">
      <div>
        <h1>{pageName}</h1>
        {destination && <p className="admin-page-description">{t(`descriptions.${destination.label}`)}</p>}
      </div>
      <nav aria-label={t('breadcrumb')}>
        <ol className="admin-breadcrumb">
          <li>
            <Link href="/admin/dashboard">{navigation('dashboard')}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{pageName}</li>
        </ol>
      </nav>
    </div>
  );
}
