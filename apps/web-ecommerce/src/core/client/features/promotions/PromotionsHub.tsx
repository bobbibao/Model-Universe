'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Link from '@/i18n/navigation';
import PromotionApi, { type PromotionsHub as Hub, type VoucherDrop } from '@/core/client/api/Promotion';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { CHECKIN_POINTS, TIER_ORDER, TIER_PERKS } from '@/shared/promotions';
import { LOYALTY_TIERS } from '@/shared/loyalty-rules';
import { formatVND } from '@/shared/server/utils/utils';
import VoucherTicket from './VoucherTicket';
import LuckyWheel from './LuckyWheel';

const MISSION_ICONS: Record<string, string> = {
  complete_profile: '👤',
  first_order: '🛍️',
  review: '✍️',
  share: '📣',
};

// "Săn ưu đãi": everything a customer can do today to save more, the way marketplaces run their voucher centres — the
// member card with points and this month's tier gifts, the daily check-in streak, the lucky wheel, voucher drops to save
// before they run out, missions, and the tier ladder. Signed-out visitors see the offers and are invited to sign in.
export default function PromotionsHub() {
  const t = useTranslations('promotions'),
    locale = useLocale();
  const { user } = useCurrentUser();
  const [hub, setHub] = useState<Hub | null>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => void PromotionApi.hub().then(setHub), []);
  useEffect(load, [load, user?.id]);

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

  if (hub === undefined) return <div className="promo-hub-loading" aria-busy="true" />;
  if (!hub) return null;
  const member = hub.member;
  const tierIndex = member ? TIER_ORDER.indexOf(member.tier as (typeof TIER_ORDER)[number]) : 0;
  const next = member?.nextTier;
  const progress = member && next ? Math.min(100, Math.round((member.lifetime / next.points) * 100)) : 100;
  const streakToday = hub.checkin.doneToday ? hub.checkin.streak : hub.checkin.streak;

  return (
    <div className="promo-hub">
      <header className="promo-hero">
        <div className="promo-hero-copy">
          <small>{t('kicker')}</small>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
          <div className="promo-hero-tags">
            <span>🎟️ {t('tagVouchers')}</span>
            <span>🚚 {t('tagFreeship')}</span>
            <span>🎡 {t('tagWheel')}</span>
            <span>✦ {t('tagPoints')}</span>
          </div>
        </div>
        <div className="promo-member-card">
          {member ? (
            <>
              <div className="promo-member-top">
                <span className={`promo-tier tier-${member.tier.toLowerCase()}`}>{member.tier}</span>
                <span>
                  <strong>{member.points.toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN')}</strong> {t('points')}
                </span>
              </div>
              <div className="promo-member-progress">
                <i style={{ width: `${progress}%` }} />
              </div>
              <small>
                {next
                  ? t('toNextTier', { points: Math.max(0, next.points - member.lifetime), tier: next.name })
                  : t('topTier')}
              </small>
              <ul>
                <li>✦ {t('multiplier', { value: member.perks.pointsMultiplierBp / 10_000 })}</li>
                <li>
                  🚚{' '}
                  {member.perks.monthlyFreeship
                    ? t('monthlyFreeship', {
                        count: member.perks.monthlyFreeship,
                        amount: formatVND(member.perks.freeshipCapVnd, locale),
                      })
                    : t('noMonthlyFreeship')}
                </li>
              </ul>
              {member.perks.monthlyFreeship > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () => PromotionApi.perks(),
                      () => t('perksIssued'),
                    )
                  }
                >
                  {t('claimPerks')}
                </button>
              )}
            </>
          ) : (
            <>
              <strong>{t('joinTitle')}</strong>
              <p>{t('joinText')}</p>
              <Link href="/auth/signin" className="promo-member-cta">
                {t('signIn')}
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="promo-play">
        <section className="promo-card promo-checkin">
          <header>
            <h2>{t('checkinTitle')}</h2>
            <p>{t('checkinText')}</p>
          </header>
          <ol className="checkin-days">
            {CHECKIN_POINTS.map((points, index) => {
              const day = index + 1;
              const done = day <= streakToday && streakToday > 0;
              return (
                <li key={day} className={`${done ? 'is-done' : ''}${day === 7 ? ' is-gift' : ''}`}>
                  <b>{day === 7 ? '🎁' : `+${points}`}</b>
                  <small>{t('day', { day })}</small>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="promo-primary"
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
        </section>

        <section className="promo-card promo-wheel">
          <header>
            <h2>{t('wheelTitle')}</h2>
            <p>{t('wheelText')}</p>
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
        </section>
      </div>

      <section className="promo-section">
        <header>
          <h2>{t('dropsTitle')}</h2>
          <p>{t('dropsText')}</p>
        </header>
        {hub.drops.length ? (
          <div className="voucher-grid">
            {hub.drops.map((drop) => (
              <VoucherTicket
                key={drop.id}
                drop={drop}
                busy={busy}
                onClaim={(target: VoucherDrop) =>
                  void act(
                    () => PromotionApi.claim(target.id),
                    (value) => t('savedCode', { code: value.code }),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <p className="promo-empty">{t('noDrops')}</p>
        )}
      </section>

      <section className="promo-section">
        <header>
          <h2>{t('missionsTitle')}</h2>
          <p>{t('missionsText')}</p>
        </header>
        <ul className="mission-list">
          {hub.missions.map((mission) => (
            <li key={mission.key} className={mission.claimed ? 'is-done' : ''}>
              <span className="mission-icon" aria-hidden="true">
                {MISSION_ICONS[mission.key] ?? '★'}
              </span>
              <span className="mission-copy">
                <strong>{t(`missions.${mission.key}.title`)}</strong>
                <small>{t(`missions.${mission.key}.text`)}</small>
              </span>
              <b className="mission-points">+{mission.points}</b>
              <button
                type="button"
                disabled={busy || mission.claimed || !hub.loyaltyOpen || (!mission.ready && mission.key !== 'share')}
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
                {mission.claimed ? t('claimed') : mission.ready || mission.key === 'share' ? t('claim') : t('notYet')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="promo-section">
        <header>
          <h2>{t('tiersTitle')}</h2>
          <p>{t('tiersText')}</p>
        </header>
        <ol className="tier-ladder">
          {LOYALTY_TIERS.map((tier, index) => {
            const perks = TIER_PERKS[tier.name];
            return (
              <li
                key={tier.name}
                className={`${index === tierIndex && member ? 'is-current' : ''} tier-${tier.name.toLowerCase()}`}
              >
                <strong>{tier.name}</strong>
                <small>{t('tierFrom', { points: tier.points })}</small>
                <span>✦ ×{perks.pointsMultiplierBp / 10_000}</span>
                <span>
                  🚚{' '}
                  {perks.monthlyFreeship
                    ? `${perks.monthlyFreeship} × ${Math.round(perks.freeshipCapVnd / 1000)}K`
                    : '—'}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="promo-footnote">{t('rules')}</p>
      </section>
    </div>
  );
}
