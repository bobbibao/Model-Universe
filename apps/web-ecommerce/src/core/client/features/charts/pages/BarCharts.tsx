'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import BarChart from '@/components/Charts/BarChart';
import { CHART_COLORS } from '@/components/Charts/ChartCard';
import DashboardApi from '@/core/client/api/Dashboard';
import { formatCompactVND, formatMonthLabel } from '@/shared/client/utils/ChartUtils';
import type { MonthlyStats, TopCustomer, TopProduct } from '@/shared/types/dashboard';

const TOP_LIMIT = 8;
const MONTHS = 12;
const MAX_LABEL_LENGTH = 32;

const shorten = (text: string) => (text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}…` : text);

const BarCharts = () => {
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);

  useEffect(() => {
    Promise.all([
      DashboardApi.getTopProducts(TOP_LIMIT),
      DashboardApi.getTopCustomers(TOP_LIMIT),
      DashboardApi.getMonthly(MONTHS),
    ]).then(([products, customers, months]) => {
      setTopProducts(products || []);
      setTopCustomers(customers || []);
      setMonthly(months || []);
      setLoading(false);
    });
  }, []);

  return (
    <>
      <Breadcrumb pageName="Biểu đồ cột" />
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2 2xl:gap-7.5">
        <BarChart
          title="Sản phẩm bán chạy"
          subtitle="Số lượng đã bán (không tính đơn đã huỷ)"
          categories={topProducts.map((product) => shorten(product.name))}
          seriesName="Đã bán"
          values={topProducts.map((product) => product.quantity)}
          horizontal
          loading={loading}
        />
        <BarChart
          title="Khách hàng mua nhiều nhất"
          subtitle="Tổng chi tiêu (không tính đơn đã huỷ)"
          categories={topCustomers.map((customer) => customer.name)}
          seriesName="Chi tiêu"
          values={topCustomers.map((customer) => customer.spent)}
          horizontal
          color={CHART_COLORS[1]}
          formatValue={formatCompactVND}
          loading={loading}
        />
        <div className="xl:col-span-2">
          <BarChart
            title="Đơn hàng theo tháng"
            subtitle="12 tháng gần nhất"
            categories={monthly.map((item) => formatMonthLabel(item.month))}
            seriesName="Đơn hàng"
            values={monthly.map((item) => item.orders)}
            color={CHART_COLORS[2]}
            loading={loading}
          />
        </div>
      </div>
    </>
  );
};

export default BarCharts;
