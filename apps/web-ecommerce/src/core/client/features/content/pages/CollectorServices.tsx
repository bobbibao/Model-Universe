'use client';

import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import AdminIcon from '@/components/Admin/AdminIcon';
import { collectorServices, ServiceTerms } from '@/components/Services/ServiceExperience';
import WorkspaceHeader from '@/components/Store/WorkspaceHeader';

export default function CollectorServices() {
  const t = useTranslations('services');
  const experience = useTranslations('experience');
  return (
    <div className="mu-wrap store-workspace service-hub-compact">
      <WorkspaceHeader title={experience('hubTitle')} description={experience('hubIntro')} icon="spark" />
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
