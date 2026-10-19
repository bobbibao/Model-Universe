'use client';

import SaleShelf from '@/core/client/features/sales/SaleShelf';
import Hero from '../components/Hero';
import FeaturedProducts from '../components/FeaturedProducts';
import Link from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { ProductSummary } from '@/shared/types/product';
import { collectorServices } from '@/components/Services/ServiceExperience';
import AdminIcon from '@/components/Admin/AdminIcon';

const Home = ({ initialProducts }: { initialProducts?: ProductSummary[] }) => {
  const t = useTranslations('home');
  const experience = useTranslations('experience');
  return (
    <>
      <SaleShelf />
      <Hero product={initialProducts?.find((product) => product.stock > 0)} />
      <section className="mu-wrap mu-section">
        <div className="mu-section-head">
          <div>
            <h2 className="mu-heading">{t('gradeTitle')}</h2>
            <p className="mu-note">{t('gradeNote')}</p>
          </div>
        </div>
        <div className="mu-grades">
          {[
            ['EG', 'Entry Grade'],
            ['HG', 'High Grade'],
            ['RG', 'Real Grade'],
            ['MG', 'Master Grade'],
            ['PG', 'Perfect Grade'],
            ['SD', 'Super Deformed'],
          ].map(([grade, name]) => (
            <Link href={`/cua-hang?grade=${grade}`} key={grade} className="mu-grade">
              <strong>{grade} ↗</strong>
              <small>{name}</small>
            </Link>
          ))}
        </div>
      </section>
      <FeaturedProducts initialProducts={initialProducts} />
      <section className="mu-wrap mu-section studio-services-section">
        <div className="mu-section-head">
          <div>
            <p className="studio-kicker">{experience('beyondTheBox')}</p>
            <h2 className="mu-heading">{experience('servicesTitle')}</h2>
          </div>
          <Link href="/services" className="studio-text-link">
            {experience('allServices')} ↗
          </Link>
        </div>
        <div className="studio-service-grid">
          {collectorServices.slice(0, 3).map((service) => (
            <Link href={service.route} className={`studio-service-card service-${service.key}`} key={service.key}>
              <div className="studio-service-symbol">
                <AdminIcon name={service.icon} size={32} />
              </div>
              <h3>{experience(`serviceNames.${service.key}`)}</h3>
              <p>{experience(`serviceSummary.${service.key}`)}</p>
              <span className="studio-service-arrow">
                <AdminIcon name="arrow" size={20} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="mu-wrap mu-section">
        <div className="mu-club">
          <div>
            <p className="mu-eyebrow" style={{ color: '#168796' }}>
              MODEL UNIVERSE / MEMBERSHIP
            </p>
            <h2 className="mu-heading mt-3">{t('club')}</h2>
            <p className="mu-note">{t('clubNote')}</p>
          </div>
          <Link href="/services/loyalty" className="mu-button">
            {t('clubCta')} ↗
          </Link>
        </div>
      </section>
    </>
  );
};

export default Home;
