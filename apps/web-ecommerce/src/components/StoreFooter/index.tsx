'use client';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import BrandLogo from '@/components/BrandLogo';
import { hasTrackingTags, openConsentSettings } from '@/shared/client/utils/consent';
export default function StoreFooter() {
  const t=useTranslations('footer');
  const nav=useTranslations('nav');
  const services=useTranslations('services');
  return <footer className="mu-footer"><div className="mu-wrap">
    <div className="mu-footer-grid"><div><BrandLogo className="text-white [&>svg]:text-brand"/><p className="mt-5 max-w-sm text-sm leading-7 text-store-muted">{t('description')}</p></div>
      <div><h2 className="mb-5 font-bold">{t('explore')}</h2><div className="flex flex-col gap-4 text-sm text-store-muted"><Link href="/shop">{nav('shop')}</Link><Link href="/assistant">{nav('assistant')}</Link><Link href="/wishlist">{nav('saved')}</Link><Link href="/contact">{nav('contact')}</Link></div></div>
      <div><h2 className="mb-5 font-bold">{t('services')}</h2><div className="flex flex-col gap-4 text-sm text-store-muted"><Link href="/services/reserve">{services('reservations')}</Link><Link href="/services/sell">{services('buyback')}</Link><Link href="/services/pawn">{services('pawn')}</Link><Link href="/services/loyalty">{services('loyalty')}</Link><Link href="/services/partner">{services('partner')}</Link></div></div>
    </div><div className="mt-12 flex flex-wrap justify-between gap-4 border-t border-white/10 pt-6 text-xs text-store-muted"><span>© {new Date().getFullYear()} {t('copyright')}</span>{hasTrackingTags && <button onClick={openConsentSettings}>{t('cookies')}</button>}</div>
  </div></footer>;
}
