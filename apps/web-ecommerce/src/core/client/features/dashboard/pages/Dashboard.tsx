'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import DonutChart from '@/components/Charts/DonutChart';
import DashboardApi from '@/core/client/api/Dashboard';
import type {
  CategoryInventory,
  DashboardSummary,
  GenderRatio,
  MonthlyStats,
  RecentOrder,
} from '@/shared/types/dashboard';
import KpiCards from '../components/KpiCards';
import RevenueOrdersChart from '../components/RevenueOrdersChart';
import InventoryByCategory from '../components/InventoryByCategory';
import RecentOrders from '../components/RecentOrders';

const CHART_MONTHS = 7;
const RECENT_ORDER_COUNT = 6;

const Dashboard = () => {
  const t = useTranslations('operationsDashboard');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary>();
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);
  const [inventory, setInventory] = useState<CategoryInventory[]>([]);
  const [gender, setGender] = useState<GenderRatio>();
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    const load = async () => {
      const [summaryResult, monthlyResult, inventoryResult, genderResult, ordersResult] = await Promise.all([
        DashboardApi.getSummary(),
        DashboardApi.getMonthly(CHART_MONTHS),
        DashboardApi.getInventoryByCategory(),
        DashboardApi.getGenderRatio(),
        DashboardApi.getRecentOrders(RECENT_ORDER_COUNT),
      ]);
      setSummary(summaryResult);
      setMonthly(monthlyResult || []);
      setInventory(inventoryResult || []);
      setGender(genderResult);
      setRecentOrders(ordersResult || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('title')}</h2>
        {summary && summary.pendingOrders > 0 && (
          <Link
            href="/admin/orders"
            className="rounded-md bg-warning/10 px-4 py-2 text-sm font-medium text-warning hover:underline"
          >
            {t('pendingOrders', { count: summary.pendingOrders })}
          </Link>
        )}
      </div>

      {summary ? (
        <KpiCards summary={summary} />
      ) : (
        loading && (
          <div className="flex justify-center py-10">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          </div>
        )
      )}

      <div className="mt-4 grid grid-cols-12 gap-4 md:mt-6 md:gap-6 2xl:mt-7.5 2xl:gap-7.5">
        <div className="col-span-12 xl:col-span-8">
          <RevenueOrdersChart data={monthly} loading={loading} />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <InventoryByCategory data={inventory} loading={loading} />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <DonutChart
            title={t('customerGender')}
            labels={[t('male'), t('female'), t('unknown')]}
            values={gender ? [gender.male, gender.female, gender.unknown] : []}
            colors={['#3C50E0', '#F0B90B', '#8A99AF']}
            loading={loading}
          />
        </div>
        <div className="col-span-12 xl:col-span-8">
          <RecentOrders data={recentOrders} loading={loading} />
        </div>
      </div>
    </>
  );
};

export default Dashboard;
