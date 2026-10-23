'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';

interface Report {
  id: number;
  day: string;
  problemCount: number;
  report: {
    policyVersion: number | null;
    orders: Record<string, number>;
    points: Record<string, number>;
    problems: {
      negativeProfitOrderIds: number[];
      doubleEarnedOrderIds: number[];
      changedPriceProductIds: number[];
    };
  };
}

// The nightly promotion reconciliation, one card per Vietnam day (PromotionReconciliationService).
export default function ReconciliationWorkspace() {
  const t = useTranslations('promotionReconciliation'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [rows, setRows] = useState<Report[]>([]);
  useEffect(() => {
    Api.get('/admin/pricing/reconciliation')
      .then((response) => setRows(response.data))
      .catch(() => {
        /* The toast explains it. */
      });
  }, []);
  return (
    <section className="space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mu-note max-w-3xl">{t('intro')}</p>
      </header>
      {!rows.length && <p className="mu-note">{t('empty')}</p>}
      {rows.map(({ id, day, problemCount, report }) => (
        <article key={id} className="mu-panel space-y-2 p-5 text-sm">
          <h2 className="text-base font-bold">
            {t('day', { day })} · {problemCount ? t('problems', { count: problemCount }) : t('clean')}
          </h2>
          <p>
            {t('orders', {
              orders: report.orders.orders ?? 0,
              withBenefits: report.orders.withBenefits ?? 0,
              stack: report.orders.stackValid ?? 0,
              cancelled: report.orders.cancelled ?? 0,
            })}
          </p>
          <p>
            {t('money', {
              voucher: money(report.orders.voucherDiscountVnd ?? 0),
              rank: money(report.orders.rankDiscountVnd ?? 0),
              shipping: money(report.orders.shippingDiscountVnd ?? 0),
            })}
          </p>
          <p>
            {t('points', {
              earned: report.points.earned ?? 0,
              reversed: report.points.reversed ?? 0,
              redeemed: report.points.redeemed ?? 0,
              reserve: money(report.points.reserveVnd ?? 0),
              available: report.points.availablePoints ?? 0,
              debt: report.points.membersInDebt ?? 0,
            })}
          </p>
          {report.problems.negativeProfitOrderIds.length > 0 && (
            <p className="text-red-700">
              {t('negative')}{' '}
              {report.problems.negativeProfitOrderIds.map((orderId) => (
                <Link key={orderId} className="mr-2 underline" href={`/admin/orders/${orderId}`}>
                  #{orderId}
                </Link>
              ))}
            </p>
          )}
          {report.problems.doubleEarnedOrderIds.length > 0 && (
            <p className="text-red-700">{t('double', { ids: report.problems.doubleEarnedOrderIds.map((value) => `#${value}`).join(', ') })}</p>
          )}
          {report.problems.changedPriceProductIds.length > 0 && (
            <p className="text-red-700">{t('changedPrice', { ids: report.problems.changedPriceProductIds.map((value) => `#${value}`).join(', ') })}</p>
          )}
          <p className="mu-note">{t('policy', { version: report.policyVersion ?? 'v6.2' })}</p>
        </article>
      ))}
    </section>
  );
}
