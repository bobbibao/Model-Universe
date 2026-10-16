'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';

interface Limits {
  listPriceVnd: number;
  memberPriceVnd: number;
  baselineProfitVnd: number;
  minimumProfitVnd: number;
  minimumPaymentVnd: number;
  maximumSafeDiscountVnd: number;
  maximumSafeBasisPoints: number;
  percents: { percent: number; discountVnd: number; profitVnd: number; allowed: boolean }[];
}
interface Calculation {
  resaleCandidates?: { sellingPriceVnd: number; baseDeductionVnd: number }[];
  memberPrice?: { targetMemberVnd: number; listPriceVnd: number; memberPriceVnd: number };
  limits?: Limits;
}
interface Simulation {
  coupon: { code: string; discountPercent: number; maxDiscountVnd: number | null };
  evaluated: number;
  eligible: number;
  ineligible: number;
  refusals: Record<string, number>;
  averageDiscountVnd: number;
  profitAfterDiscountVnd: number;
  profitLossBasisPoints: number;
  betterThanStandardCount: number;
  recommendCatalogWide: boolean;
  samples: { sku: string; name: string; priceVnd: number; costVnd: number; discountVnd: number; profitVnd: number; lossBasisPoints: number }[];
}

const percentOf = (basisPoints: number) => (basisPoints / 100).toFixed(2);

// Staff pricing tools (docs/business/pricing-voucher-specification.md, chapters II–VI and XII): resale candidates from
// a buyback price, the list price for a target member price, the safe voucher range, and a voucher simulation.
export default function PricingWorkspace() {
  const t = useTranslations('pricingAdmin'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [result, setResult] = useState<Calculation>();
  const [simulation, setSimulation] = useState<Simulation>();
  const [busy, setBusy] = useState(false);
  const numberOrUndefined = (value: FormDataEntryValue | null) => (value ? Number(value) : undefined);
  const calculate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      setResult(
        (
          await Api.post('/admin/pricing/calculate', {
            buybackVnd: numberOrUndefined(form.get('buybackVnd')),
            targetMemberVnd: numberOrUndefined(form.get('targetMemberVnd')),
            costVnd: numberOrUndefined(form.get('costVnd')),
            basket: form.get('basket') === 'on',
          })
        ).data,
      );
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  const simulate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('couponId'));
    setBusy(true);
    try {
      setSimulation((await Api.get(`/admin/pricing/coupons/${Number(code)}/simulate`)).data);
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mu-note">{t('intro')}</p>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <form className="mu-panel space-y-4 p-5" onSubmit={(event) => void calculate(event)}>
          <h2 className="text-xl font-bold">{t('calculator')}</h2>
          <label className="mu-field">
            {t('buyback')}
            <input name="buybackVnd" type="number" min={1} step={1} />
          </label>
          <label className="mu-field">
            {t('targetMember')}
            <input name="targetMemberVnd" type="number" min={1} step={1} />
          </label>
          <label className="mu-field">
            {t('cost')}
            <input name="costVnd" type="number" min={0} step={1} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" name="basket" type="checkbox" />
            {t('basket')}
          </label>
          <button className="mu-button" disabled={busy}>
            {t('calculate')}
          </button>
          {result?.resaleCandidates && (
            <div>
              <h3 className="font-semibold">{t('candidates')}</h3>
              {result.resaleCandidates.length ? (
                <ul className="mu-note">
                  {result.resaleCandidates.map((candidate) => (
                    <li key={candidate.sellingPriceVnd}>
                      {t('candidate', { price: money(candidate.sellingPriceVnd), deduction: money(candidate.baseDeductionVnd) })}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mu-note">{t('noCandidate')}</p>
              )}
            </div>
          )}
          {result?.memberPrice && (
            <p>
              {t('listFromMember', { member: money(result.memberPrice.targetMemberVnd), list: money(result.memberPrice.listPriceVnd), check: money(result.memberPrice.memberPriceVnd) })}
            </p>
          )}
          {result?.limits && (
            <div className="space-y-2 text-sm">
              <p>{t('baseline', { amount: money(result.limits.baselineProfitVnd) })}</p>
              <p>{t('minimumProfit', { amount: money(result.limits.minimumProfitVnd) })}</p>
              <p>{t('minimumPayment', { amount: money(result.limits.minimumPaymentVnd) })}</p>
              <p>
                {t('maxDiscount', { amount: money(result.limits.maximumSafeDiscountVnd), percent: percentOf(result.limits.maximumSafeBasisPoints) })}
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>%</th>
                    <th>{t('discount')}</th>
                    <th>{t('profit')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.limits.percents.map((row) => (
                    <tr key={row.percent}>
                      <td>{row.percent}%</td>
                      <td>{money(row.discountVnd)}</td>
                      <td>{money(row.profitVnd)}</td>
                      <td>{t(row.allowed ? 'allowed' : 'notAllowed')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
        <form className="mu-panel space-y-4 p-5" onSubmit={(event) => void simulate(event)}>
          <h2 className="text-xl font-bold">{t('simulateTitle')}</h2>
          <p className="mu-note">{t('simulateNote')}</p>
          <label className="mu-field">
            {t('couponId')}
            <input name="couponId" type="number" min={1} step={1} required />
          </label>
          <button className="mu-button" disabled={busy}>
            {t('simulate')}
          </button>
          {simulation && (
            <div className="space-y-2 text-sm">
              <p className="font-semibold">
                {simulation.coupon.code} · {simulation.coupon.discountPercent}%
                {simulation.coupon.maxDiscountVnd ? ` · ${money(simulation.coupon.maxDiscountVnd)}` : ''}
              </p>
              <p>{t('eligibleCount', { eligible: simulation.eligible, total: simulation.evaluated })}</p>
              {Object.entries(simulation.refusals).map(([reason, count]) => (
                <p key={reason} className="mu-note">
                  {t(`refusals.${reason}`)}: {count}
                </p>
              ))}
              <p>{t('avgDiscount', { amount: money(simulation.averageDiscountVnd) })}</p>
              <p>{t('profitAfter', { amount: money(simulation.profitAfterDiscountVnd), percent: percentOf(simulation.profitLossBasisPoints) })}</p>
              <p>{t('betterThanStandard', { count: simulation.betterThanStandardCount })}</p>
              <p className="font-semibold">{t(simulation.recommendCatalogWide ? 'recommendWide' : 'notRecommendWide')}</p>
              <ul className="mu-note">
                {simulation.samples.map((sample) => (
                  <li key={sample.sku}>
                    {sample.sku} · {money(sample.priceVnd)} · −{money(sample.discountVnd)} · {t('profit')} {money(sample.profitVnd)} (−{percentOf(sample.lossBasisPoints)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
