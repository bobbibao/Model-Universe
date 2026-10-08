'use client';

import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import UniverseArt from '@/components/UniverseArt';

const SERVICES = [
  { key: 'reservations', route: '/services/reserve', code: '01 / RESERVE' },
  { key: 'buyback', route: '/services/sell', code: '02 / REHOME' },
  { key: 'pawn', route: '/services/pawn', code: '03 / CUSTODY' },
  { key: 'loyalty', route: '/services/loyalty', code: '04 / COLLECT' },
  { key: 'partner', route: '/services/partner', code: '05 / PARTNER' },
] as const;

export default function CollectorServices() {
  const t = useTranslations('services');
  return (
    <div className="mu-wrap">
      <section className="mu-section grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="mu-eyebrow">MODEL UNIVERSE / COLLECTOR ORBIT</p>
          <h1 className="mu-heading mt-4 max-w-3xl">{t('title')}</h1>
          <p className="mu-note mt-6 max-w-2xl text-lg">{t('subtitle')}</p>
          <p className="mu-note mt-5 max-w-2xl">{t('agreementNote')}</p>
          <Link className="mu-button mt-7" href="/reservations">
            {t('workspace')} ↗
          </Link>
        </div>
        <div className="pointer-events-none mx-auto w-full max-w-md opacity-90">
          <UniverseArt />
        </div>
      </section>
      <section className="pb-16" aria-label={t('title')}>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {SERVICES.map((service) => (
            <Link href={service.route} key={service.key} className="mu-service flex h-full flex-col">
              <span>{service.code}</span>
              <h2 className="mt-5">{t(service.key)} ↗</h2>
              <p className="mt-4 grow">{t(`descriptions.${service.key}`)}</p>
              <span className="mt-7 inline-block text-sm text-brand">{t('openService')}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
