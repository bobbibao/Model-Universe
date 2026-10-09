'use client';

import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import AdminIcon from '@/components/Admin/AdminIcon';
import { collectorServices, ServiceTerms } from '@/components/Services/ServiceExperience';

export default function CollectorServices() {
  const t = useTranslations('services');
  const experience = useTranslations('experience');
  return (
    <div className="mu-wrap">
      <section className="studio-service-hub">
        <div>
          <span className="studio-kicker">{experience('collectorServices')}</span>
          <h1 className="mt-4">{experience('hubTitle')}</h1>
          <p>{experience('hubIntro')}</p>
        </div>
        <div className="studio-hub-art" aria-hidden="true">
          <span>✳</span>
          <div>{experience('hubBadge')}</div>
        </div>
      </section>
      <section className="studio-service-hub-grid" aria-label={t('title')}>
        <div className="studio-service-grid">
          {collectorServices.map((service) => (
            <Link href={service.route} key={service.key} className={`studio-service-card service-${service.key}`}>
              <div className="studio-service-symbol">
                <AdminIcon name={service.icon} size={32} />
              </div>
              <h2>{experience(`serviceNames.${service.key}`)}</h2>
              <p>{experience(`serviceSummary.${service.key}`)}</p>
              <span className="studio-service-arrow">
                <AdminIcon name="arrow" size={20} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <ServiceTerms>
        <p>{t('subtitle')}</p>
        <p>{t('agreementNote')}</p>
      </ServiceTerms>
    </div>
  );
}
