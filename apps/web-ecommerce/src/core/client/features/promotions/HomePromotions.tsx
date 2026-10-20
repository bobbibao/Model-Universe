'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Link from '@/i18n/navigation';
import PromotionApi, { type PromotionsHub } from '@/core/client/api/Promotion';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { useCountdown } from '@/components/PriceTag';
import VoucherTicket from './VoucherTicket';

// The top of the home page, as marketplaces open theirs: big event banners (flash sale with its countdown, voucher
// drops, the lucky wheel), a row of quick doors into the offers, and today's vouchers to save in one tap.
export default function HomePromotions() {
  const t = useTranslations('homePromotions'),
    p = useTranslations('promotions');
  const { user } = useCurrentUser();
  const [hub, setHub] = useState<PromotionsHub | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => void PromotionApi.hub().then(setHub), []);
  useEffect(load, [load, user?.id]);
  const flash = hub?.events[0];
  const countdown = useCountdown(flash?.endsAt ?? null);
  const open = hub?.drops.filter((drop) => !drop.claimed && drop.remaining !== 0).slice(0, 3) ?? [];

  const claim = async (id: number) => {
    if (!user) {
      toast.info(p('signInFirst'));
      return;
    }
    setBusy(true);
    try {
      const value = await PromotionApi.claim(id);
      toast.success(p('savedCode', { code: value.code }));
      load();
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="home-promos mu-wrap">
      <div className="home-banners">
        <Link href="/uu-dai" className="home-banner is-flash">
          <small>⚡ FLASH SALE</small>
          <strong>{flash ? flash.title : t('flashTitle')}</strong>
          <span>{flash ? t('flashUpTo', { percent: flash.maximumPercent }) : t('flashSoon')}</span>
          {countdown && (
            <span className="home-banner-clock">
              {countdown.days > 0 && <b>{countdown.days}d</b>}
              {countdown.clock.split(':').map((part, index) => (
                <b key={index}>{part}</b>
              ))}
            </span>
          )}
          <em>{t('shopNow')} →</em>
        </Link>
        <Link href="/uu-dai" className="home-banner is-vouchers">
          <small>🎟️ {t('vouchersKicker')}</small>
          <strong>{t('vouchersTitle')}</strong>
          <span>{t('vouchersText', { count: hub?.drops.length ?? 0 })}</span>
          <em>{t('collect')} →</em>
        </Link>
        <Link href="/uu-dai" className="home-banner is-wheel">
          <small>🎡 {t('wheelKicker')}</small>
          <strong>{t('wheelTitle')}</strong>
          <span>{t('wheelText')}</span>
          <em>{hub?.wheel.spunToday ? t('wheelDone') : t('spin')} →</em>
        </Link>
      </div>

      <nav className="home-doors" aria-label={t('doors')}>
        {[
          ['🎟️', t('doorVouchers')],
          ['🚚', t('doorFreeship')],
          ['📅', hub?.checkin.doneToday ? t('doorCheckedIn') : t('doorCheckin')],
          ['🎡', t('doorWheel')],
          ['⚡', t('doorFlash')],
          ['👑', t('doorMember')],
        ].map(([icon, label]) => (
          <Link key={label} href="/uu-dai" className="home-door">
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </Link>
        ))}
      </nav>

      {open.length > 0 && (
        <div className="home-vouchers">
          <header>
            <h2>{t('todayVouchers')}</h2>
            <Link href="/uu-dai">{t('seeAll')} →</Link>
          </header>
          <div className="voucher-grid">
            {open.map((drop) => (
              <VoucherTicket key={drop.id} drop={drop} busy={busy} onClaim={(target) => void claim(target.id)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
