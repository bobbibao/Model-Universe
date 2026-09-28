'use client';

import type { ApexOptions } from 'apexcharts';
import ChartCard, { ApexChart, CHART_COLORS, CHART_FONT } from './ChartCard';

interface BarChartProps {
  title: string;
  subtitle?: string;
  categories: string[];
  seriesName: string;
  values: number[];
  horizontal?: boolean;
  color?: string;
  loading?: boolean;
  formatValue?: (value: number) => string;
  height?: number;
}

const BarChart = ({
  title,
  subtitle,
  categories,
  seriesName,
  values,
  horizontal = false,
  color = CHART_COLORS[0],
  loading = false,
  formatValue = (value) => value.toLocaleString('vi-VN'),
  height = 340,
}: BarChartProps) => {
  const options: ApexOptions = {
    chart: { fontFamily: CHART_FONT, toolbar: { show: false } },
    colors: [color],
    plotOptions: { bar: { horizontal, borderRadius: 3, barHeight: '60%', columnWidth: '50%' } },
    dataLabels: { enabled: false },
    xaxis: {
      categories,
      labels: horizontal ? { formatter: (value) => formatValue(Number(value)) } : {},
    },
    yaxis: {
      labels: horizontal ? { maxWidth: 220 } : { formatter: (value) => formatValue(value) },
    },
    tooltip: { y: { formatter: (value) => formatValue(value) } },
  };
  return (
    <ChartCard title={title} subtitle={subtitle} loading={loading} empty={!loading && values.length === 0}>
      <ApexChart options={options} series={[{ name: seriesName, data: values }]} type="bar" height={height} />
    </ChartCard>
  );
};

export default BarChart;
