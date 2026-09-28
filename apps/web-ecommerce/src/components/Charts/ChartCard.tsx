'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// ApexCharts needs the browser (same dynamic import as the TailAdmin chart components).
export const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export const CHART_COLORS = ['#F0B90B', '#3C50E0', '#10B981', '#FB5454', '#259AE6', '#80CAEE', '#FFBA00', '#8A99AF'];

export const CHART_FONT = 'Satoshi, sans-serif';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  className?: string;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}

const ChartCard = ({ title, subtitle, className = '', loading = false, empty = false, children }: ChartCardProps) => (
  <section
    className={`rounded-sm border border-stroke bg-white px-5 pb-5 pt-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5 ${className}`}
  >
    <h3 className="text-xl font-semibold text-black dark:text-white">{title}</h3>
    {subtitle && <p className="mt-1 text-sm text-body">{subtitle}</p>}
    <div className="mt-4">
      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : empty ? (
        <p className="flex h-60 items-center justify-center text-body">Chưa có dữ liệu</p>
      ) : (
        children
      )}
    </div>
  </section>
);

export default ChartCard;
