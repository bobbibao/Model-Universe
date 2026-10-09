'use client';

import { useLocale, useTranslations } from 'next-intl';
import CardDataStats from '@/components/CardDataStats';
import { formatVND } from '@/shared/server/utils/utils';
import { formatCompactVND } from '@/shared/client/utils/ChartUtils';
import type { DashboardSummary, TrendMetric } from '@/shared/types/dashboard';

const trend = (metric: TrendMetric) => ({
  rate: `${metric.change > 0 ? '+' : ''}${metric.change}%`,
  levelUp: metric.change > 0,
  levelDown: metric.change < 0,
});

const Icon = ({ path }: { path: string }) => (
  <svg className="fill-brand-hover" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d={path} />
  </svg>
);

// Totals with this month's trend compared with last month.
const KpiCards = ({ summary }: { summary: DashboardSummary }) => {
  const t = useTranslations('operationsDashboard'), locale = useLocale();
  return (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-4 2xl:gap-7.5">
    <CardDataStats
      title={t('valueThisMonth', { amount: formatCompactVND(summary.revenue.current, locale) })}
      total={formatVND(summary.revenue.total)}
      {...trend(summary.revenue)}
    >
      <Icon path="M12 1a11 11 0 1 0 11 11A11 11 0 0 0 12 1Zm1 17.93V21h-2v-2.07A4 4 0 0 1 8 15h2a2 2 0 1 0 2-2 4 4 0 0 1-1-7.87V3h2v2.13A4 4 0 0 1 16 9h-2a2 2 0 1 0-2 2 4 4 0 0 1 1 7.93Z" />
    </CardDataStats>
    <CardDataStats
      title={t('ordersThisMonth', { count: summary.orders.current })}
      total={summary.orders.total.toLocaleString(locale)}
      {...trend(summary.orders)}
    >
      <Icon path="M7 18a2 2 0 1 0 2 2 2 2 0 0 0-2-2Zm10 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2ZM7.2 14h9.9a2 2 0 0 0 1.8-1.1l3.5-6.4-1.8-1L17.1 12H8.1L4.3 4H1v2h2l3.6 7.6L5.2 16A2 2 0 0 0 7 19h12v-2H7l1.1-2Z" />
    </CardDataStats>
    <CardDataStats
      title={t('customersThisMonth', { count: summary.customers.current })}
      total={summary.customers.total.toLocaleString(locale)}
      {...trend(summary.customers)}
    >
      <Icon path="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05A4.22 4.22 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z" />
    </CardDataStats>
    <CardDataStats
      title={t('activeProducts', { count: summary.products.outOfStock })}
      total={summary.products.total.toLocaleString(locale)}
      rate=""
    >
      <Icon path="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.24L18.53 7.5 12 10.76 5.47 7.5 12 4.24ZM5 9.12l6 3v7.64l-6-3V9.12Zm8 10.64v-7.64l6-3v7.64l-6 3Z" />
    </CardDataStats>
  </div>
);
};

export default KpiCards;
