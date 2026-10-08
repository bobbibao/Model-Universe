'use client';

import Hero from '../components/Hero';
import FeaturedProducts from '../components/FeaturedProducts';
import Link from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { ProductSummary } from '@/shared/types/product';

const Home = ({ initialProducts }: { initialProducts?: ProductSummary[] }) => {
  const t = useTranslations('home');
  return (
    <>
      <Hero />
      <section className="mu-wrap mu-section">
        <div className="mu-section-head"><div><h2 className="mu-heading">{t('gradeTitle')}</h2><p className="mu-note">{t('gradeNote')}</p></div></div>
        <div className="mu-grades">{[['EG','Entry Grade'],['HG','High Grade'],['RG','Real Grade'],['MG','Master Grade'],['PG','Perfect Grade'],['SD','Super Deformed']].map(([grade,name]) => <Link href={`/shop?grade=${grade}`} key={grade} className="mu-grade"><strong>{grade} ↗</strong><small>{name}</small></Link>)}</div>
      </section>
      <FeaturedProducts initialProducts={initialProducts} />
      <section className="mu-wrap mu-section"><h2 className="mu-heading mb-8">{t('servicesTitle')}</h2><div className="mu-services">
        {['reserve','sell','pawn'].map((service,index) => <Link href={`/services/${service}`} className="mu-service" key={service}><span>0{index+1} / MODEL UNIVERSE</span><h3>{t(service)} ↗</h3><p>{t(`${service}Note`)}</p></Link>)}
      </div></section>
      <section className="mu-wrap mu-section"><div className="mu-club"><div><p className="mu-eyebrow" style={{color:'#168796'}}>MODEL UNIVERSE / MEMBERSHIP</p><h2 className="mu-heading mt-3">{t('club')}</h2><p className="mu-note">{t('clubNote')}</p></div><Link href="/services/loyalty" className="mu-button">{t('clubCta')} ↗</Link></div></section>
    </>
  );
};

export default Home;
