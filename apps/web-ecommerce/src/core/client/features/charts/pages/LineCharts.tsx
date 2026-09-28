'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import LineChart from '@/components/Charts/LineChart';
import { CHART_COLORS } from '@/components/Charts/ChartCard';
import DashboardApi from '@/core/client/api/Dashboard';
import { formatCompactVND, formatMonthLabel } from '@/shared/client/utils/ChartUtils';
import type { MonthlyStats } from '@/shared/types/dashboard';

const MONTHS = 12;

const LineCharts = () => {
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    DashboardApi.getMonthly(MONTHS).then((result) => {
      setMonthly(result || []);
      setLoading(false);
    });
  }, []);

  const categories = monthly.map((item) => formatMonthLabel(item.month));
  const series = (key: keyof Omit<MonthlyStats, 'month'>) => monthly.map((item) => item[key]);

  return (
    <>
      <Breadcrumb pageName="Biểu đồ đường" />
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2 2xl:gap-7.5">
        <LineChart
          title="Doanh thu"
          subtitle="12 tháng gần nhất, không tính đơn đã huỷ"
          categories={categories}
          seriesName="Doanh thu"
          values={series('revenue')}
          formatValue={formatCompactVND}
          loading={loading}
        />
        <LineChart
          title="Khách hàng mới"
          subtitle="Số tài khoản đăng ký mỗi tháng"
          categories={categories}
          seriesName="Khách hàng mới"
          values={series('newCustomers')}
          color={CHART_COLORS[1]}
          loading={loading}
        />
        <LineChart
          title="Giảm giá đã áp dụng"
          subtitle="Tổng tiền giảm từ mã khuyến mãi"
          categories={categories}
          seriesName="Giảm giá"
          values={series('discount')}
          color={CHART_COLORS[3]}
          formatValue={formatCompactVND}
          loading={loading}
        />
        <LineChart
          title="Chi phí nhập hàng"
          subtitle="Tổng giá trị phiếu nhập kho"
          categories={categories}
          seriesName="Chi phí nhập"
          values={series('importCost')}
          color={CHART_COLORS[2]}
          formatValue={formatCompactVND}
          loading={loading}
        />
      </div>
    </>
  );
};

export default LineCharts;
