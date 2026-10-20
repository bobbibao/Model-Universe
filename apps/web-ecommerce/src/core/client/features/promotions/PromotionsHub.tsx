'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Link from '@/i18n/navigation';
import PromoIcon, { type PromoIconName } from '@/components/PromoIcon';
import PromotionApi, { type PromotionsHub as Hub, type VoucherDrop } from '@/core/client/api/Promotion';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { CHECKIN_POINTS, DAILY_DROPS, TIER_ORDER, TIER_PERKS } from '@/shared/promotions';
import { LOYALTY_TIERS } from '@/shared/loyalty-rules';
import { formatVND } from '@/shared/server/utils/utils';
import VoucherTicket from './VoucherTicket';
import LuckyWheel from './LuckyWheel';
import MemberCard from './MemberCard';

const MISSION_ICONS: Record<string, PromoIconName> = {
  complete_profile: 'user',
  first_order: 'bag',
  review: 'star',
  share: 'share',
};
const SECTIONS = ['vouchers', 'daily', 'missions', 'tiers'] as const;

// The offers page: the member's standing first, then everything that saves money today, each in its own section that
// the top navigation jumps to — vouchers (codes anyone can use and timed drops to save), the daily check-in and wheel,
// one-off missions, and a table of what each tier gets.
export default function PromotionsHub() {
  const t = useTranslations('promotions'),
    tiers = useTranslations('tiers'),
    locale = useLocale();
  const { user } = useCurrentUser();
  const [hub, setHub] = useState<Hub | null>();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'discount' | 'freeship'>('all');
  const load = useCallback(() => void PromotionApi.hub().then(setHub), []);
  useEffect(load, [load, user?.id]);
  const money = (value: number) => formatVND(value, locale);

  const act = async <T,>(action: () => Promise<T>, success: (value: T) => string) => {
    if (!user) {
      toast.info(t('signInFirst'));
      return null;
    }
    setBusy(true);
    try {
      const value = await action();
      toast.success(success(value));
      load();
      return value;
    } catch {
      return null; // The toast explains it.
    } finally {
      setBusy(false);
    }
  };

  if (hub === undefined) return <div className="promo-skeleton" aria-busy="true" />;
  if (!hub) return null;
  const member = hub.member;
  const tierIndex = member ? TIER_ORDER.indexOf(member.tier as (typeof TIER_ORDER)[number]) : -1;
  const vouchers = [...hub.standing, ...hub.drops].filter((drop) => filter === 'all' || drop.benefitType === filter);
  const openDrops = hub.drops.filter((drop) => new Date(drop.startsAt).getTime() <= Date.now() && !drop.claimed);
  const missionsDone = hub.missions.filter((mission) => mission.claimed).length;
  const now = new Date();
  const vnHour = (now.getUTCHours() + 7) % 24;
  const claim = (target: VoucherDrop) =>
    void act(
      () => PromotionApi.claim(target.id),
      (value) => t('savedCode', { code: value.code }),
    );

  return (
    <div className="promo-page">
      <header className="promo-head">
        <div>
          <p className="promo-kicker">{t('kicker')}</p>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
        <nav className="promo-anchors" aria-label={t('sections')}>
          {SECTIONS.map((section) => (
            <a key={section} href={`#${section}`}>
              {t(`nav.${section}`)}
            </a>
          ))}
        </nav>
      </header>

      <section className="promo-overview">
        {member ? (
          <MemberCard member={member} />
        ) : (
          <article className="member-card is-guest">
            <span className="member-medal" aria-hidden="true">
              <PromoIcon name="crown" size={22} />
            </span>
            <h2>{t('joinTitle')}</h2>
            <p>{t('joinText')}</p>
            <Link href="/auth/signin?redirect=/uu-dai" className="promo-button">
              {t('signIn')}
            </Link>
          </article>
        )}
        <div className="promo-today">
          <h2>{t('todayTitle')}</h2>
          <a href="#daily" className={`today-tile${hub.checkin.doneToday ? ' is-done' : ''}`}>
            <PromoIcon name="calendar" />
            <span>
              <strong>{t('checkinTitle')}</strong>
              <small>
                {hub.checkin.doneToday
                  ? t('checkedInStreak', { streak: hub.checkin.streak })
                  : t('checkinNow', { points: hub.checkin.nextReward.points })}
              </small>
            </span>
            {hub.checkin.doneToday && <PromoIcon name="check" className="today-check" />}
          </a>
          <a href="#daily" className={`today-tile${hub.wheel.spunToday ? ' is-done' : ''}`}>
            <PromoIcon name="wheel" />
            <span>
              <strong>{t('wheelTitle')}</strong>
              <small>{hub.wheel.spunToday ? t('spunToday') : t('wheelReady')}</small>
            </span>
            {hub.wheel.spunToday && <PromoIcon name="check" className="today-check" />}
          </a>
          <a href="#vouchers" className="today-tile">
            <PromoIcon name="ticket" />
            <span>
              <strong>{t('openVouchers', { count: openDrops.length })}</strong>
              <small>{t('dropTimes')}</small>
            </span>
          </a>
          {member && member.perks.monthlyFreeship > 0 && (
            <button
              type="button"
              className="today-tile"
              disabled={busy}
              onClick={() =>
                void act(
                  () => PromotionApi.perks(),
                  () => t('perksIssued'),
                )
              }
            >
              <PromoIcon name="gift" />
              <span>
                <strong>{t('claimPerks')}</strong>
                <small>
                  {t('monthlyFreeship', {
                    count: member.perks.monthlyFreeship,
                    amount: money(member.perks.freeshipCapVnd),
                  })}
                </small>
              </span>
            </button>
          )}
        </div>
      </section>

      <section id="vouchers" className="promo-section">
        <header className="promo-section-head">
          <div>
            <h2>{t('dropsTitle')}</h2>
            <p>{t('dropsText')}</p>
          </div>
          <div className="promo-segments" role="tablist">
            {(['all', 'discount', 'freeship'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={filter === key ? 'is-active' : ''}
                onClick={() => setFilter(key)}
              >
                {t(`filter.${key}`)}
              </button>
            ))}
          </div>
        </header>
        <ol className="drop-timeline" aria-label={t('dropTimes')}>
          {DAILY_DROPS.map((drop) => {
            const state = vnHour >= drop.hour ? 'is-open' : 'is-later';
            return (
              <li key={drop.slug} className={state}>
                <b>{String(drop.hour).padStart(2, '0')}:00</b>
                <span>{drop.title}</span>
                <small>{state === 'is-open' ? t('slotOpen') : t('slotLater')}</small>
              </li>
            );
          })}
        </ol>
        {vouchers.length ? (
          <div className="voucher-grid">
            {vouchers.map((drop, index) => (
              <div key={`${drop.kind}-${drop.id}`} className="promo-reveal" style={{ ['--i' as string]: index }}>
                <VoucherTicket drop={drop} busy={busy} onClaim={claim} />
              </div>
            ))}
          </div>
        ) : (
          <p className="promo-empty">{t('noDrops')}</p>
        )}
      </section>

      <section id="daily" className="promo-section promo-daily">
        <article className="promo-card">
          <header>
            <span className="promo-card-icon">
              <PromoIcon name="calendar" />
            </span>
            <div>
              <h2>{t('checkinTitle')}</h2>
              <p>{t('checkinText')}</p>
            </div>
          </header>
          <ol className="checkin-days">
            {CHECKIN_POINTS.map((points, index) => {
              const day = index + 1;
              const done = day <= hub.checkin.streak;
              const today = !hub.checkin.doneToday && day === hub.checkin.streak + 1;
              return (
                <li
                  key={day}
                  className={`${done ? 'is-done' : ''}${today ? ' is-today' : ''}${day === 7 ? ' is-gift' : ''}`}
                >
                  <span className="checkin-mark">
                    {done ? (
                      <PromoIcon name="check" size={16} />
                    ) : day === 7 ? (
                      <PromoIcon name="gift" size={16} />
                    ) : (
                      `+${points}`
                    )}
                  </span>
                  <small>{t('day', { day })}</small>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="promo-button"
            disabled={busy || hub.checkin.doneToday || !hub.loyaltyOpen}
            onClick={() =>
              void act(
                () => PromotionApi.checkin(),
                (value) =>
                  value.couponCode
                    ? t('checkinGift', { code: value.couponCode })
                    : t('checkinDone', { points: value.points }),
              )
            }
          >
            {!hub.loyaltyOpen
              ? t('comingSoon')
              : hub.checkin.doneToday
                ? t('checkedIn')
                : t('checkinNow', { points: hub.checkin.nextReward.points })}
          </button>
        </article>

        <article className="promo-card promo-wheel">
          <header>
            <span className="promo-card-icon">
              <PromoIcon name="wheel" />
            </span>
            <div>
              <h2>{t('wheelTitle')}</h2>
              <p>{t('wheelText')}</p>
            </div>
          </header>
          <LuckyWheel
            prizes={hub.wheel.prizes}
            disabled={!hub.loyaltyOpen || hub.wheel.spunToday || busy}
            onSpin={async () => {
              const result = await act(
                () => PromotionApi.spin(),
                (value) =>
                  value.couponCode
                    ? t('wheelWonCode', { prize: value.label, code: value.couponCode })
                    : t('wheelWon', { prize: value.label }),
              );
              return result ? result.index : null;
            }}
          />
        </article>
      </section>

      <section id="missions" className="promo-section">
        <header className="promo-section-head">
          <div>
            <h2>{t('missionsTitle')}</h2>
            <p>{t('missionsText')}</p>
          </div>
          <span className="mission-progress">
            <b>
              {missionsDone}/{hub.missions.length}
            </b>
            <i>
              <em style={{ width: `${(missionsDone / Math.max(1, hub.missions.length)) * 100}%` }} />
            </i>
          </span>
        </header>
        <ul className="mission-list">
          {hub.missions.map((mission) => {
            const ready = mission.ready || mission.key === 'share';
            return (
              <li key={mission.key} className={mission.claimed ? 'is-done' : ready ? 'is-ready' : ''}>
                <span className="mission-icon">
                  <PromoIcon name={mission.claimed ? 'check' : (MISSION_ICONS[mission.key] ?? 'star')} />
                </span>
                <span className="mission-copy">
                  <strong>{t(`missions.${mission.key}.title`)}</strong>
                  <small>{t(`missions.${mission.key}.text`)}</small>
                </span>
                <span className="mission-points">+{mission.points}</span>
                <button
                  type="button"
                  disabled={busy || mission.claimed || !hub.loyaltyOpen || !ready}
                  onClick={() => {
                    if (mission.key === 'share' && typeof navigator !== 'undefined' && navigator.share)
                      void navigator
                        .share({ title: 'Model Universe', url: window.location.origin })
                        .catch(() => undefined);
                    void act(
                      () => PromotionApi.mission(mission.key),
                      (value) => t('missionDone', { points: value.points }),
                    );
                  }}
                >
                  {mission.claimed ? t('claimed') : ready ? t('claim') : t('notYet')}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="tiers" className="promo-section">
        <header className="promo-section-head">
          <div>
            <h2>{t('tiersTitle')}</h2>
            <p>{t('tiersText')}</p>
          </div>
        </header>
        <div className="tier-table-wrap">
          <table className="tier-table">
            <thead>
              <tr>
                <th scope="col">{t('tierColumn')}</th>
                {LOYALTY_TIERS.map((tier, index) => (
                  <th
                    key={tier.name}
                    scope="col"
                    className={`tier-${tier.name.toLowerCase()}${index === tierIndex ? ' is-current' : ''}`}
                  >
                    <span className="tier-chip">{tiers(tier.name)}</span>
                    {index === tierIndex && <small>{t('youAreHere')}</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t('rowPoints')}</th>
                {LOYALTY_TIERS.map((tier, index) => (
                  <td key={tier.name} className={index === tierIndex ? 'is-current' : ''}>
                    {tier.points.toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN')}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('rowSpend')}</th>
                {LOYALTY_TIERS.map((tier, index) => (
                  <td key={tier.name} className={index === tierIndex ? 'is-current' : ''}>
                    {tier.points ? money(tier.points * 40_000) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('rowMultiplier')}</th>
                {LOYALTY_TIERS.map((tier, index) => (
                  <td key={tier.name} className={index === tierIndex ? 'is-current' : ''}>
                    ×
                    {(TIER_PERKS[tier.name].pointsMultiplierBp / 10_000).toLocaleString(
                      locale === 'en' ? 'en-GB' : 'vi-VN',
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">{t('rowFreeship')}</th>
                {LOYALTY_TIERS.map((tier, index) => {
                  const perks = TIER_PERKS[tier.name];
                  return (
                    <td key={tier.name} className={index === tierIndex ? 'is-current' : ''}>
                      {perks.monthlyFreeship
                        ? t('freeshipCell', { count: perks.monthlyFreeship, amount: money(perks.freeshipCapVnd) })
                        : '—'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="promo-footnote">
          <PromoIcon name="info" size={16} />
          {t('rules')}
        </p>
      </section>
    </div>
  );
}
