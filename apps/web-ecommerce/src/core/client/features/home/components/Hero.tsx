'use client';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import UniverseArt from '@/components/UniverseArt';
export default function Hero() {
  const t = useTranslations('home');
  return <section className="mu-hero">
    <div className="mu-wrap mu-hero-grid">
      <div><p className="mu-eyebrow">{t('eyebrow')}</p>
        <h1 className="mu-title">{t('title')}<br/><span>{t('accent')}</span></h1>
        <p className="mu-intro">{t('description')}</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/shop" className="mu-button">{t('cta')} ↗</Link><Link href="/assistant" className="mu-button mu-button-secondary">✦ {t('secondary')}</Link></div>
      </div><UniverseArt />
    </div><div className="mu-trust"><p className="mu-wrap">◈ {t('trust')}</p></div>
  </section>;
}
