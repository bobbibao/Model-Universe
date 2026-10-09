'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import Link from '@/i18n/navigation';
import AdminIcon from '@/components/Admin/AdminIcon';

export type CollectorService = 'reserve' | 'sell' | 'pawn' | 'loyalty' | 'partner';
export const collectorServices: { key: CollectorService; icon: string; route: string }[] = [
  { key: 'reserve', icon: 'calendar', route: '/services/reserve' },
  { key: 'sell', icon: 'exchange', route: '/services/sell' },
  { key: 'pawn', icon: 'shield', route: '/services/pawn' },
  { key: 'loyalty', icon: 'spark', route: '/services/loyalty' },
  { key: 'partner', icon: 'users', route: '/services/partner' },
];

export function ServiceHeader({
  service,
  title,
  admin = false,
}: {
  service: CollectorService;
  title: string;
  admin?: boolean;
}) {
  const t = useTranslations('experience');
  const item = collectorServices.find((item) => item.key === service)!;
  return (
    <header className={`service-experience-header service-${service} ${admin ? 'is-operations' : ''}`}>
      <div className="service-header-copy">
        <span className="studio-kicker">
          <AdminIcon name={item.icon} size={16} />
          {admin ? t('operations') : t('collectorServices')}
        </span>
        <h1>{title}</h1>
        <p>{t(`serviceSummary.${service}`)}</p>
        {!admin && (
          <nav className="service-switcher" aria-label={t('collectorServices')}>
            {collectorServices.map((item) => (
              <Link key={item.key} href={item.route} aria-current={item.key === service ? 'page' : undefined}>
                <AdminIcon name={item.icon} size={15} />
                {t(`serviceNames.${item.key}`)}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="service-header-art" aria-hidden="true">
        <div className="service-art-orbit" />
        <div className="service-art-icon">
          <AdminIcon name={item.icon} size={58} />
        </div>
        <span>MODEL UNIVERSE</span>
      </div>
    </header>
  );
}

export function ServiceTerms({ children, title }: { children: ReactNode; title?: string }) {
  const t = useTranslations('experience');
  return (
    <details className="service-terms">
      <summary>
        <span>
          <AdminIcon name="shield" size={17} />
          {title || t('serviceTerms')}
        </span>
        <span className="service-terms-toggle" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="service-terms-content">{children}</div>
    </details>
  );
}

export function ServiceEmpty({ children }: { children: ReactNode }) {
  const t = useTranslations('experience');
  return (
    <div className="service-empty">
      <div className="service-empty-art" aria-hidden="true">
        <AdminIcon name="box" size={34} />
      </div>
      <div>
        <h2>{t('emptyTitle')}</h2>
        <p>{children}</p>
      </div>
    </div>
  );
}
