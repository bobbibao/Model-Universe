'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import PromoIcon from '@/components/PromoIcon';
import { LOYALTY_TIERS } from '@/shared/loyalty-rules';
import { TIER_ORDER, spendForPoints } from '@/shared/promotions';
import { RANK_BENEFITS, rankBenefitFor } from '@/shared/voucher-stack';
import { formatVND } from '@/shared/server/utils/utils';

export interface MemberSummary {
  tier: string;
  lifetime: number;
  points: number;
  nextTier: { name: string; points: number } | null;
  pending?: { orders: number; points: number };
}

// Counts up to `value` over ~0.9 s (immediately when the visitor prefers reduced motion).
export function useCountUp(value: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

// The member's standing at a glance: tier, spendable points (for point vouchers; points are never cash), a track across
// every tier with how far the member is, how much more to spend to reach the next tier, the orders whose points are
// still pending, and the rank benefit the tier adds to one voucher (rules v6.2).
export default function MemberCard({ member, compact = false }: { member: MemberSummary; compact?: boolean }) {
  const t = useTranslations('member'),
    tiers = useTranslations('tiers'),
    locale = useLocale();
  const money = (value: number) => formatVND(value, locale);
  const points = useCountUp(member.points);
  const index = Math.max(0, TIER_ORDER.indexOf(member.tier as (typeof TIER_ORDER)[number]));
  const next = member.nextTier;
  // Equal segments per tier, filled up to the current tier plus the share of the way to the next one.
  const current = LOYALTY_TIERS[index];
  const within = next ? Math.min(1, (member.lifetime - current.points) / (next.points - current.points)) : 1;
  const fill = ((index + within) / (LOYALTY_TIERS.length - 1)) * 100;
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(fill));
    return () => cancelAnimationFrame(frame);
  }, [fill]);
  const missing = next ? Math.max(0, next.points - member.lifetime) : 0;
  const rank = rankBenefitFor(member.lifetime);
  const firstRank = RANK_BENEFITS[0];
  const percent = (bps: number) => (bps / 100).toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN');
  return (
    <article className={`member-card tier-${member.tier.toLowerCase()}${compact ? ' is-compact' : ''}`}>
      <header className="member-card-head">
        <span className="member-medal" aria-hidden="true">
          <PromoIcon name="crown" size={22} />
        </span>
        <span>
          <small>{t('tier')}</small>
          <strong>{tiers(member.tier)}</strong>
        </span>
        <span className="member-points">
          <small>{t('available')}</small>
          <strong>{points.toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN')}</strong>
          <em>{t('pointsUse')}</em>
        </span>
      </header>

      <div className="member-track" aria-label={t('progress')}>
        <div className="member-track-bar">
          <i style={{ width: `${animated}%` }} />
        </div>
        <ol>
          {LOYALTY_TIERS.map((tier, position) => (
            <li
              key={tier.name}
              className={`${position <= index ? 'is-reached' : ''}${position === index ? ' is-current' : ''}`}
              style={{ left: `${(position / (LOYALTY_TIERS.length - 1)) * 100}%` }}
            >
              <span className="member-track-dot" />
              <small>{tiers(tier.name)}</small>
            </li>
          ))}
        </ol>
      </div>

      <p className="member-next">
        {next ? (
          <>
            {t.rich('toNext', {
              points: missing.toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN'),
              tier: tiers(next.name),
              b: (chunks) => <strong>{chunks}</strong>,
            })}{' '}
            <span>{t('spendHint', { amount: money(spendForPoints(missing)) })}</span>
          </>
        ) : (
          t('top')
        )}
      </p>

      {member.pending && member.pending.orders > 0 && (
        <p className="member-pending">
          <PromoIcon name="clock" size={16} />
          {t('pending', { orders: member.pending.orders, points: member.pending.points })}
        </p>
      )}

      {!compact && (
        <ul className="member-perks">
          <li>
            <PromoIcon name="crown" size={16} />
            {rank
              ? t('rankBenefit', { percent: percent(rank.bps), cap: money(rank.capVnd) })
              : t('noRank', { percent: percent(firstRank.bps), points: firstRank.minimumLifetimePoints })}
          </li>
          <li>
            <PromoIcon name="coin" size={16} />
            {t('earning')}
          </li>
        </ul>
      )}
    </article>
  );
}
