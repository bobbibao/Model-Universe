'use client';

import DateTimeInput from '@/components/DateTimeInput';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link, { useRouter } from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { formatVND } from '@/shared/server/utils/utils';
import type { LoyaltyOverview, Redemption } from '@/shared/types/loyalty';
import { ServiceHeader, ServiceTerms } from '@/components/Services/ServiceExperience';
import Carousel from '@/components/Carousel';
import PromoIcon, { type PromoIconName } from '@/components/PromoIcon';
import MemberCard from '@/core/client/features/promotions/MemberCard';

export default function Membership({ embedded = false, onChange }: { embedded?: boolean; onChange?: (overview: LoyaltyOverview) => void } = {}) {
  const t = useTranslations('loyalty'),
    common = useTranslations('common'),
    checkout = useTranslations('checkout'),
    locale = useLocale();
  const { user, loading } = useCurrentUser();
  const userId = user?.id;
  const router = useRouter();
  useEffect(() => {
    if (userId && !embedded) router.replace('/user-profile?section=membership');
  }, [userId, embedded, router]);
  const [overview, setOverview] = useState<LoyaltyOverview>(),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [evidence, setEvidence] = useState<{ id: number; name: string }[]>([]),
    [gift, setGift] = useState<Redemption | null>(null);
  const pending = useRef<{ key: string; rewardKey: string } | undefined>(undefined);
  const [rewardKind, setRewardKind] = useState<'fixed' | 'percent' | 'gift'>('fixed');
  const money = (value: number) => formatVND(value, locale);
  const load = useCallback(async () => {
    if (!userId || !embedded) return;
    try {
      const next = (await Api.get('/loyalty')).data as LoyaltyOverview;
      setOverview(next);
      onChange?.(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [userId, embedded, onChange]);
  useEffect(() => {
    setOverview(undefined);
    setEvidence([]);
    setGift(null);
    pending.current = undefined;
    void load();
  }, [load]);
  const redeem = async (rewardKey: string) => {
    if (!user) return;
    const storageKey = `model-universe.pending-redemption.v1.${user.id}`;
    if (!pending.current) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        if (
          saved &&
          typeof saved.rewardKey === 'string' &&
          typeof saved.key === 'string' &&
          /^[0-9a-f-]{36}$/.test(saved.key)
        )
          pending.current = saved;
      } catch {
        /* Storage may be disabled or contain obsolete state. */
      }
    }
    if (!pending.current || pending.current.rewardKey !== rewardKey)
      pending.current = { key: crypto.randomUUID(), rewardKey };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(pending.current));
    } catch {
      /* Preserve retry identity in memory. */
    }
    setBusy(true);
    try {
      await Api.post('/loyalty/redeem', { requestKey: pending.current.key, rewardKey });
      pending.current = undefined;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Storage may be disabled. */
      }
      await load();
    } catch {
      /* Keep the request identity for a network retry. */
    } finally {
      setBusy(false);
    }
  };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'loyalty_claim');
      const saved = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
      setEvidence((current) => [...current, { id: saved.id, name: file.name }]);
    } catch {
      /* The API reports upload validation. */
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };
  const submitClaim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget,
      form = new FormData(element);
    setBusy(true);
    try {
      await Api.post('/loyalty/claims', {
        ...Object.fromEntries(form),
        claimedVnd: Number(form.get('claimedVnd')),
        evidenceIds: evidence.map((file) => file.id),
      });
      setEvidence([]);
      element.reset();
      await load();
    } catch {
      /* The shared API reports the failure. */
    } finally {
      setBusy(false);
    }
  };
  const giftDelivery = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!gift) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await Api.post(`/loyalty/gifts/${gift.id}/delivery`, { shipping: Object.fromEntries(form) });
      setGift(null);
      await load();
    } catch {
      /* The shared API reports the failure. */
    } finally {
      setBusy(false);
    }
  };
  if (userId && !embedded) return <p role="status" className="account-loading">{common('loading')}</p>;
  const historyIcon = (kind: string): PromoIconName =>
    (
      ({
        earn: 'bag',
        historical: 'bag',
        reverse: 'arrow',
        redeem: 'gift',
        spend: 'coin',
        restore: 'coin',
        checkin: 'calendar',
        wheel: 'wheel',
        mission: 'star',
      }) as Record<string, PromoIconName>
    )[kind] ?? 'coin';
  return (
    <section className={embedded ? 'account-membership service-workspace' : 'mu-wrap service-workspace py-12'}>
      {embedded ? (
        <div className="account-section-heading">
          <div>
            <h2>{t('title')}</h2>
            <p>{t('intro')}</p>
          </div>
        </div>
      ) : (
        <ServiceHeader service="loyalty" title={t('title')} />
      )}
      {!loading && !user && (
        <>
          <ServiceTerms>
            <p>{t('intro')}</p>
            <p>{t('earning')}</p>
            <p className="mu-note">{t('benefits')}</p>
          </ServiceTerms>
          <Link href="/auth/signin?redirect=/services/loyalty" className="mu-button">
            {t('signIn')}
          </Link>
        </>
      )}
      {failed && (
        <button className="mu-button mu-button-secondary" onClick={() => void load()}>
          {common('retry')}
        </button>
      )}
      {user && !overview && !failed && <div className="promo-skeleton" aria-busy="true" />}
      {overview && (
        <div className="membership">
          {!overview.active && (
            <p role="status" className="membership-notice">
              <PromoIcon name="info" size={18} />
              {t('policyPending')}
            </p>
          )}
          <div className="membership-top">
            <MemberCard
              member={{
                tier: overview.balances.tier.name,
                lifetime: overview.balances.lifetime,
                points: overview.balances.available,
                nextTier: overview.balances.nextTier,
                pending: {
                  orders: overview.pending.length,
                  points: overview.pending.reduce((sum, row) => sum + row.points, 0),
                },
              }}
            />
            <aside className="membership-pending">
              <h3>
                <PromoIcon name="clock" size={18} />
                {t('pendingTitle')}
              </h3>
              <p>{t('pendingText')}</p>
              {overview.pending.length ? (
                <ul>
                  {overview.pending.slice(0, 6).map((row) => (
                    <li key={row.orderId}>
                      <Link href="/user-profile?section=orders">
                        {t('pendingRow', { id: row.orderId })}
                      </Link>
                      <span className={`membership-status is-${row.status.toLowerCase()}`}>
                        {t(`orderStatus.${row.status}`)}
                      </span>
                      <b>+{row.points.toLocaleString(locale)}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <Link href="/uu-dai" className="membership-link">
                  {t('viewOffers')} <PromoIcon name="arrow" size={14} />
                </Link>
              )}
            </aside>
          </div>

          <div className="membership-stats">
            {(
              [
                ['statsLifetime', overview.balances.lifetime, 'crown'],
                ['statsUsed', overview.balances.used, 'coin'],
                ...(overview.balances.debt > 0 ? [['statsDebt', overview.balances.debt, 'info']] : []),
              ] as [string, number, PromoIconName][]
            ).map(([key, value, icon]) => (
              <div key={key} className="membership-stat">
                <PromoIcon name={icon} />
                <span>
                  <small>{t(key)}</small>
                  <strong>{value.toLocaleString(locale)}</strong>
                </span>
              </div>
            ))}
          </div>

          <details className="membership-how">
            <summary>
              <PromoIcon name="info" size={18} />
              {t('howItWorks')}
            </summary>
            <p>{t('earning')}</p>
            <p>{t('benefits')}</p>
            <p>{t('tierNote')}</p>
          </details>

          <section className="membership-block">
            <header className="promo-section-head">
              <div>
                <h2>{t('rewards')}</h2>
                <p>{t('redemptionNote')}</p>
              </div>
              <div className="promo-segments" role="tablist" aria-label={t('rewardTypes')}>
                {(['fixed', 'percent', 'gift'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={rewardKind === kind}
                    className={rewardKind === kind ? 'is-active' : ''}
                    onClick={() => setRewardKind(kind)}
                  >
                    {t(`rewardType.${kind}`)}
                  </button>
                ))}
              </div>
            </header>
            {rewardKind === 'gift' && overview.gifts.length === 0 && <p className="promo-empty">{t('noGifts')}</p>}
            <Carousel label={t('rewards')} className="reward-carousel" dots={false} key={rewardKind}>
              {[
                ...overview.rewards
                  .filter((reward) => reward.kind === rewardKind)
                  .map((reward) => ({
                    key: reward.key,
                    points: reward.points,
                    title: reward.kind === 'fixed' ? money(reward.amount) : `${reward.amount}%`,
                    text:
                      reward.minOrderVnd > 0
                        ? t('minimum', { amount: money(reward.minOrderVnd) })
                        : t('cap', { amount: money(reward.maxDiscountVnd) }),
                    available: true,
                  })),
                ...(rewardKind === 'gift'
                  ? overview.gifts.map((item) => ({
                      key: `gift-${item.id}`,
                      points: item.pointsCost,
                      title: locale === 'vi' ? item.titleVi : item.titleEn,
                      text: t('realGift'),
                      available: item.available,
                    }))
                  : []),
              ].map((reward) => {
                const missing = Math.max(0, reward.points - overview.balances.available);
                return (
                  <article key={reward.key} className={`reward-card${missing ? '' : ' is-ready'}`}>
                    <span className="reward-points">
                      <PromoIcon name="coin" size={14} />
                      {t('points', { points: reward.points })}
                    </span>
                    <h3>{reward.title}</h3>
                    <p>{reward.text}</p>
                    <span className="reward-meter">
                      <i style={{ width: `${Math.min(100, (overview.balances.available / reward.points) * 100)}%` }} />
                    </span>
                    <small>{missing ? t('rewardsNeed', { points: missing.toLocaleString(locale) }) : ' '}</small>
                    <button
                      type="button"
                      className="promo-button"
                      disabled={busy || !overview.active || !reward.available || missing > 0}
                      onClick={() => void redeem(reward.key)}
                    >
                      {t(reward.available ? 'redeem' : 'giftUnavailable')}
                    </button>
                  </article>
                );
              })}
            </Carousel>
          </section>

          <section className="membership-block">
            <header className="promo-section-head">
              <div>
                <h2>{t('wallet')}</h2>
              </div>
            </header>
            {overview.wallet.length === 0 && <p className="promo-empty">{t('walletEmpty')}</p>}
            <div className="membership-wallet">
              {overview.wallet.map((item) => (
                <article key={item.id} className="membership-wallet-item">
                  <PromoIcon name={item.giftProductId ? 'gift' : 'ticket'} />
                  <span>
                    <strong className="break-all">
                      {item.coupon?.code ||
                        (locale === 'vi' ? item.rewardSnapshot.titleVi : item.rewardSnapshot.titleEn) ||
                        item.rewardSnapshot.name}
                    </strong>
                    <small>
                      {t('points', { points: item.pointsCost })} ·{' '}
                      {t(
                        `status.${item.coupon?.usedAt ? 'used' : item.coupon?.reservedOrderId ? 'reserved' : item.coupon && new Date(item.coupon.expirationDate) <= new Date() ? 'expired' : item.status}`,
                      )}
                      {item.coupon &&
                        ` · ${t('validUntil', { date: new Date(item.coupon.expirationDate).toLocaleDateString(locale) })}`}
                    </small>
                  </span>
                  {item.giftProductId && item.status !== 'fulfilled' && (
                    <button className="promo-button is-ghost" onClick={() => setGift(item)}>
                      {t('requestGift')}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
          {gift && (
            <form onSubmit={(event) => void giftDelivery(event)} className="mu-panel space-y-3 p-5">
              <h3 className="font-bold">
                {t('requestGift')} #{gift.id}
              </h3>
              {['recipientName', 'phone', 'address', 'city', 'note'].map((key) => (
                <label key={key} className="mu-field">
                  {checkout(key)}
                  <input name={key} required={key !== 'note'} defaultValue={gift.shipping?.[key] || ''} />
                </label>
              ))}
              <button className="mu-button" disabled={busy}>
                {common('confirm')}
              </button>
              <button type="button" className="mu-button mu-button-secondary ml-2" onClick={() => setGift(null)}>
                {common('cancel')}
              </button>
            </form>
          )}

          <section className="membership-block">
            <header className="promo-section-head">
              <div>
                <h2>{t('history')}</h2>
              </div>
            </header>
            {overview.history.length === 0 && <p className="promo-empty">{t('historyEmpty')}</p>}
            <ol className="points-history">
              {overview.history.map((entry) => (
                <li key={entry.id}>
                  <span className={`points-history-icon${entry.balanceDelta < 0 ? ' is-out' : ''}`}>
                    <PromoIcon name={historyIcon(entry.kind)} size={16} />
                  </span>
                  <span className="points-history-copy">
                    <strong>{t.has(`kind.${entry.kind}`) ? t(`kind.${entry.kind}`) : entry.kind}</strong>
                    <small>{new Date(entry.createdAt).toLocaleString(locale)}</small>
                  </span>
                  <b className={entry.balanceDelta < 0 ? 'is-out' : 'is-in'}>
                    {entry.balanceDelta > 0 ? '+' : ''}
                    {entry.balanceDelta.toLocaleString(locale)}
                  </b>
                </li>
              ))}
            </ol>
          </section>

          <details className="membership-how membership-claim">
            <summary>
              <PromoIcon name="package" size={18} />
              {t('historical')}
            </summary>
            <p>{t('historicalNote')}</p>
            <form onSubmit={(event) => void submitClaim(event)} className="mt-4 space-y-3">
              <label className="mu-field">
                {t('transactionReference')}
                <input name="transactionReference" minLength={8} maxLength={128} required />
              </label>
              <label className="mu-field">
                {t('transactionDate')}
                <DateTimeInput type="date" name="transactionDate" required />
              </label>
              <label className="mu-field">
                {t('claimedAmount')}
                <input type="number" step="1" min="1" name="claimedVnd" required />
              </label>
              <label className="mu-field">
                {t('note')}
                <textarea name="note" maxLength={1000} />
              </label>
              <label className="mu-field">
                {t('evidence')}
                <input
                  disabled={busy || evidence.length >= 12}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void upload(event)}
                />
              </label>
              {evidence.map((file) => (
                <p key={file.id} className="mu-note">
                  {file.name}
                </p>
              ))}
              <button className="mu-button" disabled={busy || evidence.length === 0}>
                {t('submitClaim')}
              </button>
            </form>
            {overview.claims.map((claim) => (
              <p key={claim.id} className="mu-note mt-4">
                #{claim.id} · {claim.transactionReference} · {t(`status.${claim.status}`)}
                {claim.reviewReason && ` · ${claim.reviewReason}`}
              </p>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
