'use client';

import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';

export default function Breadcrumb({ pageName }: { pageName: string }) {
  const t = useTranslations('adminWorkspace'),
    navigation = useTranslations('adminNavigation');
  return (
    <div className="admin-page-heading">
      <div>
        <h1>{pageName}</h1>
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
