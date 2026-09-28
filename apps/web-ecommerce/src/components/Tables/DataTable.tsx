'use client';

import React from 'react';
import type { Pagination, SortState } from '@/shared/types/pagination';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  pagination?: Pagination;
  onPageChange?: (page: number) => void;
}

const SortIndicator = ({ direction }: { direction?: 'asc' | 'desc' }) => (
  <span className="ml-1 inline-flex flex-col text-[8px] leading-[8px]">
    <span className={direction === 'asc' ? 'text-brand-hover' : 'opacity-40'}>▲</span>
    <span className={direction === 'desc' ? 'text-brand-hover' : 'opacity-40'}>▼</span>
  </span>
);

// Server-driven table in TailAdmin markup: sorting and pagination are delegated to the parent through callbacks.
function DataTable<T>({
  columns,
  data,
  rowKey,
  title,
  actions,
  loading = false,
  emptyText = 'Không có dữ liệu',
  onRowClick,
  sort,
  onSortChange,
  pagination,
  onPageChange,
}: DataTableProps<T>) {
  const handleSort = (column: DataTableColumn<T>) => {
    if (!column.sortable || !onSortChange) return;
    const direction = sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: column.key, direction });
  };

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7.5">
          {title && <h4 className="text-xl font-semibold text-black dark:text-white">{title}</h4>}
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      )}

      <div className="max-w-full overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="bg-gray-2 text-left dark:bg-meta-4">
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column)}
                  className={`px-4 py-4 font-medium text-black dark:text-white ${
                    column.sortable && onSortChange ? 'cursor-pointer select-none' : ''
                  } ${column.className || ''}`}
                >
                  <span className="inline-flex items-center">
                    {column.header}
                    {column.sortable && onSortChange && (
                      <SortIndicator direction={sort?.key === column.key ? sort.direction : undefined} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center">
                  <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand border-t-transparent" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-body dark:text-bodydark">
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-stroke dark:border-strokedark ${
                    onRowClick ? 'cursor-pointer hover:bg-gray-2 dark:hover:bg-meta-4' : ''
                  }`}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-4 text-black dark:text-bodydark1 ${column.className || ''}`}>
                      {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && onPageChange && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm sm:px-7.5">
          <span className="text-body dark:text-bodydark">
            Trang {pagination.page} / {pagination.totalPages} · {pagination.total} bản ghi
          </span>
          <div className="flex items-center gap-2">
            <PageButton disabled={!pagination.hasPreviousPage} onClick={() => onPageChange(1)}>
              «
            </PageButton>
            <PageButton disabled={!pagination.hasPreviousPage} onClick={() => onPageChange(pagination.page - 1)}>
              Trước
            </PageButton>
            <PageButton disabled={!pagination.hasNextPage} onClick={() => onPageChange(pagination.page + 1)}>
              Sau
            </PageButton>
            <PageButton disabled={!pagination.hasNextPage} onClick={() => onPageChange(pagination.totalPages)}>
              »
            </PageButton>
          </div>
        </div>
      )}
    </div>
  );
}

const PageButton = ({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className="rounded border border-stroke px-3 py-1.5 font-medium text-black hover:border-brand-hover hover:text-brand-hover disabled:cursor-not-allowed disabled:opacity-40 dark:border-strokedark dark:text-white"
  >
    {children}
  </button>
);

export default DataTable;
