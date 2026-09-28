'use client';

import type { ApexOptions } from 'apexcharts';
import ChartCard, { ApexChart, CHART_COLORS, CHART_FONT } from '@/components/Charts/ChartCard';
import { formatVND } from '@/shared/server/utils/utils';
import { formatCompactVND, formatMonthLabel } from '@/shared/client/utils/ChartUtils';
import type { MonthlyStats } from '@/shared/types/dashboard';

// Revenue (columns, left axis) and number of orders (line, right axis) per month.
const RevenueOrdersChart = ({ data, loading }: { data: MonthlyStats[]; loading: boolean }) => {
  const options: ApexOptions = {
    chart: { fontFamily: CHART_FONT, toolbar: { show: false } },
    colors: [CHART_COLORS[0], CHART_COLORS[1]],
    stroke: { width: [0, 3], curve: 'smooth' },
    plotOptions: { bar: { columnWidth: '45%', borderRadius: 3 } },
    dataLabels: { enabled: false },
    legend: { position: 'top', horizontalAlign: 'left' },
    xaxis: { categories: data.map((item) => formatMonthLabel(item.month)) },
    yaxis: [
      { title: { text: 'Doanh thu' }, labels: { formatter: (value) => formatCompactVND(value) } },
      { opposite: true, title: { text: 'Đơn hàng' }, labels: { formatter: (value) => `${Math.round(value)}` } },
    ],
    tooltip: {
      shared: true,
      intersect: false,
      y: { formatter: (value, { seriesIndex }) => (seriesIndex === 0 ? formatVND(value) : `${value} đơn`) },
    },
  };
  return (
    <ChartCard
      title="Doanh thu & Đơn hàng"
      subtitle="7 tháng gần nhất, không tính đơn đã huỷ"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ApexChart
        options={options}
        series={[
          { name: 'Doanh thu', type: 'column', data: data.map((item) => item.revenue) },
          { name: 'Đơn hàng', type: 'line', data: data.map((item) => item.orders) },
        ]}
        type="line"
        height={340}
      />
    </ChartCard>
  );
};

export default RevenueOrdersChart;
