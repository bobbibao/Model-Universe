'use client';

import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import UniverseArt from '@/components/UniverseArt';
import StudioReveal from '@/components/StudioReveal';
import AdminIcon from '@/components/Admin/AdminIcon';
import type { ProductSummary } from '@/shared/types/product';

export default function Hero({ product }: { product?: ProductSummary }) {
  const t = useTranslations('experience');
  const home = useTranslations('home');
  return (
    <section className="studio-hero">
      <StudioReveal className="mu-wrap studio-hero-grid">
        <div className="studio-hero-copy">
          <p data-reveal className="studio-kicker">
            <span className="studio-live-dot" />
            {t('heroEyebrow')}
          </p>
          <h1 data-reveal>
            {t('heroTitle')}
            <span>
              {t('heroAccent')}
              <svg viewBox="0 0 360 22" fill="none" aria-hidden="true">
                <path d="M4 15C100 0 234 0 354 13" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p data-reveal className="studio-hero-intro">
            {t('heroIntro')}
          </p>
          <div data-reveal className="studio-hero-actions">
            <Link href="/shop" className="mu-button">
              {home('cta')}
              <AdminIcon name="arrow" size={18} />
            </Link>
            <Link href="/kit-finder" className="studio-text-link">
              {t('findMyKit')}
              <AdminIcon name="spark" size={18} />
            </Link>
          </div>
          <div data-reveal className="studio-hero-footnote">
            <span>EG → PG</span>
            <p>{t('heroFootnote')}</p>
          </div>
        </div>
        <div className="studio-showcase" data-reveal>
          <span className="studio-showcase-label">MODEL UNIVERSE / MU–01</span>
          <div className="studio-showcase-word" aria-hidden="true">
            BUILD.
          </div>
          <UniverseArt />
          <div className="studio-showcase-star" aria-hidden="true">
            ✳
          </div>
          <div className="studio-showcase-info">
            <div>
              <span>
                {product?.grade || 'GUNPLA'} / {t('collectorPick')}
              </span>
              <strong>{product?.name || 'Gundam Unicorn'}</strong>
            </div>
            <Link href={product ? `/shop/product/${product.id}` : '/shop'} aria-label={product?.name || t('explore')}>
              <AdminIcon name="arrow" size={24} />
            </Link>
          </div>
        </div>
      </StudioReveal>
      <div className="studio-ribbon">
        <div className="mu-wrap">
          <span>
            <AdminIcon name="box" size={18} />
            {t('ribbonCollect')}
          </span>
          <span>
            <AdminIcon name="shield" size={18} />
            {t('ribbonCondition')}
          </span>
          <span>
            <AdminIcon name="exchange" size={18} />
            {t('ribbonRehome')}
          </span>
          <span>
            <AdminIcon name="spark" size={18} />
            {t('ribbonAssist')}
          </span>
        </div>
      </div>
    </section>
  );
}
