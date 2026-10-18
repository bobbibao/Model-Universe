'use client';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ProductStage from '@/components/ProductStage';
import AdminIcon from '@/components/Admin/AdminIcon';

export default function About() {
  const t = useTranslations('studioContent');
  return (
    <section className="mu-wrap mu-section studio-about">
      <div className="studio-about-hero">
        <div>
          <p className="studio-kicker">MODEL UNIVERSE / {t('aboutEyebrow')}</p>
          <h1>{t('aboutTitle')}</h1>
          <p className="studio-hero-intro">{t('aboutIntro')}</p>
          <Link href="/cua-hang" className="mu-button mt-7">
            {t('explore')} <AdminIcon name="arrow" size={18} />
          </Link>
        </div>
        <div className="studio-about-stage">
          <ProductStage
            src="/images/catalog/unicorn-ntd-front.webp"
            alt="RX-0 Gundam Unicorn"
            sizes="(min-width: 900px) 42vw, 90vw"
            priority
          />
          <span className="studio-about-stamp">BUILD · COLLECT · CONNECT</span>
        </div>
      </div>
      <div className="studio-about-values">
        {[
          { key: 'collection', icon: 'box', route: '/cua-hang' },
          { key: 'condition', icon: 'shield', route: '/services/sell' },
          { key: 'community', icon: 'spark', route: '/services/loyalty' },
        ].map((value) => (
          <Link key={value.key} href={value.route}>
            <AdminIcon name={value.icon} size={27} />
            <h2>{t(`${value.key}Title`)}</h2>
            <p>{t(`${value.key}Intro`)}</p>
            <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
      <div className="studio-about-contact">
        <h2>{t('connectTitle')}</h2>
        <Link href="/contact" className="mu-button-secondary">
          {t('contact')} ↗
        </Link>
      </div>
    </section>
  );
}
