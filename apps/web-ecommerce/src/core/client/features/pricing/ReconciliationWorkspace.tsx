'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import DataTable, { type DataTableColumn } from '@/components/Tables/DataTable';
import { formatVND } from '@/shared/server/utils/utils';
import './pricing-admin.css';

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

// The nightly promotion reconciliation (PromotionReconciliationService): the latest day and the points liability at a
// glance, one row per Vietnam day to scan, and each day's problems with links to act on.
export default function ReconciliationWorkspace() {
  const t = useTranslations('promotionReconciliation'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Api.get('/admin/pricing/reconciliation')
      .then((response) => setRows(response.data))
      .catch(() => {
        /* The toast explains it. */
      })
      .finally(() => setLoading(false));
  }, []);
  const latest = rows[0];
  const given = (row: Report) =>
    (row.report.orders.voucherDiscountVnd ?? 0) +
    (row.report.orders.rankDiscountVnd ?? 0) +
    (row.report.orders.shippingDiscountVnd ?? 0);

  const columns: DataTableColumn<Report>[] = [
    { key: 'day', header: t('columns.day'), render: (row) => <b className="whitespace-nowrap">{row.day}</b> },
    {
      key: 'orders',
      header: t('columns.orders'),
      render: (row) => (
        <span className="pa-cell">
          <span>
            {t('ordersCell', {
              orders: row.report.orders.orders ?? 0,
              withBenefits: row.report.orders.withBenefits ?? 0,
            })}
          </span>
          <small>
            {t('stackCell', { stack: row.report.orders.stackValid ?? 0, cancelled: row.report.orders.cancelled ?? 0 })}
          </small>
        </span>
      ),
    },
    {
      key: 'given',
      header: t('columns.given'),
      render: (row) => (
        <span className="pa-cell">
          <span className="pa-money">{money(given(row))}</span>
          <small>
            {t('givenCell', {
              voucher: money(row.report.orders.voucherDiscountVnd ?? 0),
              rank: money(row.report.orders.rankDiscountVnd ?? 0),
              shipping: money(row.report.orders.shippingDiscountVnd ?? 0),
            })}
          </small>
        </span>
      ),
    },
    {
      key: 'points',
      header: t('columns.points'),
      render: (row) => (
        <span className="pa-cell">
          <span>
            +{row.report.points.earned ?? 0} / −{row.report.points.reversed ? Math.abs(row.report.points.reversed) : 0}{' '}
            / {t('redeemedShort', { count: row.report.points.redeemed ?? 0 })}
          </span>
          <small>{t('reserveCell', { amount: money(row.report.points.reserveVnd ?? 0) })}</small>
        </span>
      ),
    },
    {
      key: 'problems',
      header: t('columns.problems'),
      render: (row) =>
        row.problemCount ? (
          <span className="pa-cell">
            <span className="pa-chip is-danger justify-self-start">{t('problems', { count: row.problemCount })}</span>
            <small>
              {row.report.problems.negativeProfitOrderIds.map((orderId) => (
                <Link key={orderId} className="mr-2 underline" href={`/admin/orders/${orderId}`}>
                  #{orderId}
                </Link>
              ))}
              {row.report.problems.doubleEarnedOrderIds.length > 0 &&
                t('double', { ids: row.report.problems.doubleEarnedOrderIds.map((value) => `#${value}`).join(', ') })}
              {row.report.problems.changedPriceProductIds.length > 0 && (
                <Link className="underline" href="/admin/pricing/approvals">
                  {t('changedPrice', { count: row.report.problems.changedPriceProductIds.length })}
                </Link>
              )}
            </small>
          </span>
        ) : (
          <span className="pa-chip is-success">{t('clean')}</span>
        ),
    },
    {
      key: 'policy',
      header: t('columns.policy'),
      render: (row) => (
        <span className="pa-chip">
          {row.report.policyVersion ? t('policyVersion', { version: row.report.policyVersion }) : t('policyDefault')}
        </span>
      ),
    },
  ];

  return (
    <section className="pa-page">
      <header className="pa-head">
        <div>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
      </header>
      {latest && (
        <div className="pa-stats">
          <div className="pa-stat">
            <span>{t('kpi.given', { day: latest.day })}</span>
            <strong>{money(given(latest))}</strong>
          </div>
          <div className="pa-stat">
            <span>{t('kpi.orders', { day: latest.day })}</span>
            <strong>
              {latest.report.orders.withBenefits ?? 0}/{latest.report.orders.orders ?? 0}
            </strong>
          </div>
          <div className="pa-stat is-success">
            <span>{t('kpi.outstanding')}</span>
            <strong>{(latest.report.points.availablePoints ?? 0).toLocaleString(locale)}</strong>
          </div>
          <div className={`pa-stat ${latest.problemCount ? 'is-danger' : 'is-success'}`}>
            <span>{t('kpi.problems')}</span>
            <strong>{latest.problemCount}</strong>
          </div>
        </div>
      )}
      <DataTable
        title={t('tableTitle')}
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        loading={loading}
        emptyText={t('empty')}
      />
    </section>
  );
}
