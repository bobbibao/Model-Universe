import { Request } from 'express';

export interface PaginationParams {
  page: number;
  perPage: number;
  limit: number;
  offset: number;
}

export interface PaginatedPayload<T> {
  payload: {
    data: T[];
    pagination: {
      total: number;
      page: number;
      per_page: number;
      total_pages: number;
      has_next_page: boolean;
      has_previous_page: boolean;
    };
  };
}

const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

// Parses `page` / `per_page` query params into page-based and limit/offset values.
export const parsePagination = (req: Request, defaultPerPage: number = DEFAULT_PER_PAGE): PaginationParams => {
  const rawPage = Number(req.query.page);
  const rawPerPage = Number(req.query.per_page);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const perPage =
    Number.isInteger(rawPerPage) && rawPerPage > 0 ? Math.min(rawPerPage, MAX_PER_PAGE) : defaultPerPage;
  return { page, perPage, limit: perPage, offset: (page - 1) * perPage };
};

// Builds the paginated response shape used by the API: { payload: { data, pagination } }.
export const toPaginatedPayload = <T>(data: T[], total: number, page: number, perPage: number): PaginatedPayload<T> => ({
  payload: {
    data,
    pagination: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      has_next_page: page * perPage < total,
      has_previous_page: page > 1,
    },
  },
});
