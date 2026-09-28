'use client';

import type { ApexOptions } from 'apexcharts';
import ChartCard, { ApexChart, CHART_COLORS, CHART_FONT } from './ChartCard';

interface LineChartProps {
  title: string;
  subtitle?: string;
  categories: string[];
  seriesName: string;
  values: number[];
  color?: string;
  loading?: boolean;
  formatValue?: (value: number) => string;
}

// Single-series area chart for monthly trends.
const LineChart = ({
  title,
  subtitle,
  categories,
  seriesName,
  values,
  color = CHART_COLORS[0],
  loading = false,
  formatValue = (value) => value.toLocaleString('vi-VN'),
}: LineChartProps) => {
  const options: ApexOptions = {
    chart: { fontFamily: CHART_FONT, toolbar: { show: false }, zoom: { enabled: false } },
    colors: [color],
    stroke: { curve: 'smooth', width: 3 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.45, opacityTo: 0.05 } },
    dataLabels: { enabled: false },
    markers: { size: 4 },
    xaxis: { categories },
    yaxis: { labels: { formatter: (value) => formatValue(value) } },
    tooltip: { y: { formatter: (value) => formatValue(value) } },
  };
  return (
    <ChartCard title={title} subtitle={subtitle} loading={loading} empty={!loading && values.length === 0}>
      <ApexChart options={options} series={[{ name: seriesName, data: values }]} type="area" height={300} />
    </ChartCard>
  );
};

export default LineChart;
