'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

// ApexCharts needs the browser (same dynamic import as the TailAdmin chart components).
export const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export const CHART_COLORS = ['#0891B2', '#818CF8', '#10B981', '#FB7185', '#38BDF8', '#C084FC', '#FBBF24', '#94A3B8'];

export const CHART_FONT = 'Satoshi, sans-serif';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  className?: string;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}

const ChartCard = ({ title, subtitle, className = '', loading = false, empty = false, children }: ChartCardProps) => {
  const t = useTranslations('dataTable');
  return (
    <section
      className={`admin-chart-card rounded-sm border border-stroke bg-white px-5 pb-5 pt-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5 ${className}`}
    >
      <h3 className="text-xl font-semibold text-black dark:text-white">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-body">{subtitle}</p>}
      <div className="mt-4">
        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          </div>
        ) : empty ? (
          <p className="flex h-60 items-center justify-center text-body">{t('empty')}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
};

export default ChartCard;
