import type { Pagination } from '@/shared/types/pagination';

const WINDOW = 2;

// Page numbers around the current page, with the first/last page and gaps ("...").
const getPages = (current: number, total: number): (number | 'gap')[] => {
  const pages: (number | 'gap')[] = [];
  for (let page = 1; page <= total; page++) {
    if (page === 1 || page === total || Math.abs(page - current) <= WINDOW) pages.push(page);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }
  return pages;
};

const buttonClassName =
  'min-w-10 rounded-md border border-stroke px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-store-card';

const StorePagination = ({
  pagination,
  onPageChange,
}: {
  pagination?: Pagination;
  onPageChange: (page: number) => void;
}) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages } = pagination;
  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Phân trang">
      <button className={buttonClassName} disabled={!pagination.hasPreviousPage} onClick={() => onPageChange(page - 1)}>
        Trước
      </button>
      {getPages(page, totalPages).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-body">
            …
          </span>
        ) : (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            aria-current={item === page ? 'page' : undefined}
            className={`${buttonClassName} ${item === page ? 'border-brand bg-brand text-brand-ink' : ''}`}
          >
            {item}
          </button>
        ),
      )}
      <button className={buttonClassName} disabled={!pagination.hasNextPage} onClick={() => onPageChange(page + 1)}>
        Sau
      </button>
    </nav>
  );
};

export default StorePagination;
