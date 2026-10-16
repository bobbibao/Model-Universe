'use client';

import { useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import type { Pagination } from '@/shared/types/pagination';

const getPages = (current: number, total: number): (number | 'gap')[] => {
  const visible = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const pages: (number | 'gap')[] = [];
  visible.forEach((page, index) => {
    if (index > 0 && page - visible[index - 1] > 1) pages.push('gap');
    pages.push(page);
  });
  return pages;
};

export default function StorePagination({
  pagination,
  onPageChange,
}: {
  pagination?: Pagination;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('common');
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, perPage, total } = pagination;
  return (
    <nav className="store-pagination" aria-label={t('pagination')}>
      <p className="store-pagination-summary">
        <strong>{t('pagePosition', { page, total: totalPages })}</strong>
        <span>{t('itemRange', { from: (page - 1) * perPage + 1, to: Math.min(page * perPage, total), total })}</span>
      </p>
      <div className="store-pagination-dock">
        <button
          className="store-pagination-direction is-previous"
          aria-label={t('previous')}
          disabled={!pagination.hasPreviousPage}
          onClick={() => onPageChange(page - 1)}
        >
          <AdminIcon name="arrow" size={17} />
          <span>{t('previous')}</span>
        </button>
        <ol>
          {getPages(page, totalPages).map((item, index) =>
            item === 'gap' ? (
              <li key={`gap-${index}`} className="store-pagination-gap" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={item} data-near={Math.abs(item - page) <= 1}>
                <button
                  aria-label={t('goToPage', { page: item })}
                  aria-current={item === page ? 'page' : undefined}
                  onClick={() => {
                    if (item !== page) onPageChange(item);
                  }}
                >
                  {item}
                </button>
              </li>
            ),
          )}
        </ol>
        <button
          className="store-pagination-direction"
          aria-label={t('next')}
          disabled={!pagination.hasNextPage}
          onClick={() => onPageChange(page + 1)}
        >
          <span>{t('next')}</span>
          <AdminIcon name="arrow" size={17} />
        </button>
      </div>
    </nav>
  );
}
