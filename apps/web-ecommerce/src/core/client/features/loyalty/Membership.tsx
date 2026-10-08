'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { formatVND } from '@/shared/server/utils/utils';
import type { LoyaltyOverview, Redemption } from '@/shared/types/loyalty';

export default function Membership() {
  const t = useTranslations('loyalty'),
    common = useTranslations('common'),
    checkout = useTranslations('checkout'),
    locale = useLocale();
  const { user, loading } = useCurrentUser();
  const [overview, setOverview] = useState<LoyaltyOverview>(),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [evidence, setEvidence] = useState<{ id: number; name: string }[]>([]),
    [gift, setGift] = useState<Redemption | null>(null);
  const pending = useRef<{ key: string; rewardKey: string }>();
  const [rewardKind, setRewardKind] = useState<'fixed' | 'percent' | 'gift'>('fixed');
  const money = (value: number) => formatVND(value, locale);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      setOverview((await Api.get('/loyalty')).data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [user]);
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
  return (
    <section className="mu-wrap py-12">
      <p className="mu-eyebrow">MODEL UNIVERSE / COLLECTOR CLUB</p>
      <h1 className="mu-title text-4xl md:text-6xl">{t('title')}</h1>
      <p className="mu-note max-w-2xl">{t('intro')}</p>
      <div className="mu-panel my-6 p-5">
        <p>{t('earning')}</p>
        <p className="mu-note">{t('benefits')}</p>
      </div>
      {!loading && !user && (
        <Link href="/auth/signin?redirect=/services/loyalty" className="mu-button">
          {t('signIn')}
        </Link>
      )}
      {failed && (
        <button className="mu-button mu-button-secondary" onClick={() => void load()}>
          {common('retry')}
        </button>
      )}
      {overview && (
        <>
          {!overview.active && (
            <p role="status" className="mu-panel my-4 border-amber-300 p-4">
              {t('policyPending')}
            </p>
          )}
          <div className="my-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['available', 'lifetime', 'used', 'debt'].map((key) => (
              <div key={key} className="mu-panel p-5">
                <p className="mu-note">{t(key)}</p>
                <p className="text-4xl font-bold">
                  {overview.balances[key as 'available' | 'lifetime' | 'used' | 'debt'].toLocaleString(locale)}
                </p>
              </div>
            ))}
          </div>
          <div className="mu-panel mb-8 p-6">
            <h2 className="text-xl font-bold">
              {t('tier')} · {overview.balances.tier.name}
            </h2>
            <p className="mu-note">{t('tierNote')}</p>
            {overview.balances.nextTier && (
              <>
                <p className="my-3">
                  {t('nextTier', {
                    tier: overview.balances.nextTier.name,
                    points: overview.balances.nextTier.points - overview.balances.lifetime,
                  })}
                </p>
                <progress
                  className="h-2 w-full accent-brand-hover"
                  value={overview.balances.lifetime}
                  max={overview.balances.nextTier.points}
                  aria-label={t('progress')}
                />
              </>
            )}
          </div>
          <h2 className="mu-section-title">{t('rewards')}</h2>
          <p className="mu-note mb-5">{t('redemptionNote')}</p>
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t('rewardTypes')}>
            {(['fixed', 'percent', 'gift'] as const).map((kind) => (
              <button
                key={kind}
                className={`mu-button ${rewardKind === kind ? '' : 'mu-button-secondary'}`}
                aria-pressed={rewardKind === kind}
                onClick={() => setRewardKind(kind)}
              >
                {t(`rewardType.${kind}`)}
              </button>
            ))}
          </div>
          {rewardKind === 'gift' && overview.gifts.length === 0 && <p className="mu-note">{t('noGifts')}</p>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {overview.rewards
              .filter((reward) => reward.kind === rewardKind)
              .map((reward) => (
                <article key={reward.key} className="mu-panel flex flex-col gap-3 p-5">
                  <p className="mu-eyebrow">{t('points', { points: reward.points })}</p>
                  <h3 className="text-2xl font-bold">
                    {reward.kind === 'fixed' ? money(reward.amount) : `${reward.amount}%`}
                  </h3>
                  <p className="mu-note">
                    {reward.minOrderVnd > 0
                      ? t('minimum', { amount: money(reward.minOrderVnd) })
                      : t('cap', { amount: money(reward.maxDiscountVnd) })}
                  </p>
                  <button
                    className="mu-button mt-auto"
                    disabled={busy || !overview.active || overview.balances.available < reward.points}
                    onClick={() => void redeem(reward.key)}
                  >
                    {t('redeem')}
                  </button>
                </article>
              ))}
            {rewardKind === 'gift' &&
              overview.gifts.map((item) => (
                <article key={`gift-${item.id}`} className="mu-panel flex flex-col gap-3 p-5">
                  <p className="mu-eyebrow">{t('points', { points: item.pointsCost })}</p>
                  <h3 className="text-xl font-bold">{locale === 'vi' ? item.titleVi : item.titleEn}</h3>
                  <p className="mu-note">{t('realGift')}</p>
                  <button
                    className="mu-button mt-auto"
                    disabled={
                      busy || !overview.active || !item.available || overview.balances.available < item.pointsCost
                    }
                    onClick={() => void redeem(`gift-${item.id}`)}
                  >
                    {t(item.available ? 'redeem' : 'giftUnavailable')}
                  </button>
                </article>
              ))}
          </div>
          <h2 className="mu-section-title mt-10">{t('wallet')}</h2>
          <div className="my-5 grid gap-4 md:grid-cols-2">
            {overview.wallet.map((item) => (
              <article key={item.id} className="mu-panel p-5">
                <h3 className="break-all font-bold">
                  {item.coupon?.code ||
                    (locale === 'vi' ? item.rewardSnapshot.titleVi : item.rewardSnapshot.titleEn) ||
                    item.rewardSnapshot.name}
                </h3>
                <p className="mu-note">
                  {t('points', { points: item.pointsCost })} ·{' '}
                  {t(
                    `status.${item.coupon?.usedAt ? 'used' : item.coupon?.reservedOrderId ? 'reserved' : item.coupon && new Date(item.coupon.expirationDate) <= new Date() ? 'expired' : item.status}`,
                  )}
                </p>
                {item.coupon && (
                  <>
                    <p className="mu-note">
                      {t('validUntil', { date: new Date(item.coupon.expirationDate).toLocaleDateString(locale) })}
                    </p>
                    <p className="mu-note">{t('couponInstruction')}</p>
                  </>
                )}
                {item.giftProductId && item.status !== 'fulfilled' && (
                  <button className="mu-button mu-button-secondary mt-3" onClick={() => setGift(item)}>
                    {t('requestGift')}
                  </button>
                )}
              </article>
            ))}
          </div>
          {overview.wallet.length === 0 && <p className="mu-note">{t('walletEmpty')}</p>}
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
          <div className="my-10 grid gap-6 lg:grid-cols-2">
            <section className="mu-panel p-5">
              <h2 className="text-xl font-bold">{t('history')}</h2>
              {overview.history.map((entry) => (
                <div key={entry.id} className="flex justify-between gap-4 border-b py-3">
                  <div>
                    <p>{t(`kind.${entry.kind}`)}</p>
                    <p className="mu-note">{new Date(entry.createdAt).toLocaleString(locale)}</p>
                    <p className="mu-note">{entry.reason}</p>
                  </div>
                  <strong>
                    {entry.balanceDelta > 0 ? '+' : ''}
                    {entry.balanceDelta}
                  </strong>
                </div>
              ))}
            </section>
            <section className="mu-panel p-5">
              <h2 className="text-xl font-bold">{t('historical')}</h2>
              <p className="mu-note">{t('historicalNote')}</p>
              <form onSubmit={(event) => void submitClaim(event)} className="mt-4 space-y-3">
                <label className="mu-field">
                  {t('transactionReference')}
                  <input name="transactionReference" minLength={8} maxLength={128} required />
                </label>
                <label className="mu-field">
                  {t('transactionDate')}
                  <input type="date" name="transactionDate" required />
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
            </section>
          </div>
        </>
      )}
    </section>
  );
}
