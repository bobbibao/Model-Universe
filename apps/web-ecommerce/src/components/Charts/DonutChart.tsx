'use client';

import type { ApexOptions } from 'apexcharts';
import ChartCard, { ApexChart, CHART_COLORS, CHART_FONT } from './ChartCard';

interface DonutChartProps {
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
  loading?: boolean;
  type?: 'donut' | 'pie';
  colors?: string[];
}

// Donut/pie card for small category breakdowns.
const DonutChart = ({ title, subtitle, labels, values, loading = false, type = 'donut', colors }: DonutChartProps) => {
  const options: ApexOptions = {
    chart: { fontFamily: CHART_FONT },
    colors: colors || CHART_COLORS,
    labels,
    legend: { position: 'bottom' },
    dataLabels: { enabled: true },
    plotOptions: { pie: { donut: { size: '60%', background: 'transparent' } } },
  };
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      loading={loading}
      empty={!loading && values.every((value) => value === 0)}
    >
      <ApexChart options={options} series={values} type={type} height={320} />
    </ChartCard>
  );
};

export default DonutChart;
