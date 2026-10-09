'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
import AdminIcon from '@/components/Admin/AdminIcon';

const CHART_MONTHS = 7;
const RECENT_ORDER_COUNT = 6;

const Dashboard = () => {
  const t = useTranslations('operationsDashboard');
  const workspace = useTranslations('adminWorkspace'),
    navigation = useTranslations('adminNavigation'),
    locale = useLocale();
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
      <div className="admin-dashboard-hero">
        <div>
          <span className="admin-eyebrow">MODEL UNIVERSE / {workspace('workspace')}</span>
          <h1>{workspace('dashboardTitle')}</h1>
          <p>{workspace('dashboardIntro')}</p>
        </div>
        <div>
          <div className="admin-dashboard-date">
            {new Date().toLocaleDateString(locale, { dateStyle: 'full', timeZone: 'Asia/Ho_Chi_Minh' })}
          </div>
          <div className="admin-dashboard-shortcuts">
            <Link href="/admin/orders">
              <AdminIcon name="orders" size={16} />
              {navigation('orders')}
            </Link>
            <Link href="/admin/products/new">
              <AdminIcon name="box" size={16} />
              {workspace('addProduct')}
            </Link>
            <Link href="/admin/agent/inbox">
              <AdminIcon name="spark" size={16} />
              {navigation('inbox')}
            </Link>
          </div>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
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
            colors={['#0891B2', '#818CF8', '#94A3B8']}
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
