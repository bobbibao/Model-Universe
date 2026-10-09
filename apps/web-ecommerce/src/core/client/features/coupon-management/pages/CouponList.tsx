'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import { inputClassName } from '@/components/FormElements/TextField';
import CouponApi, { CouponListParams } from '@/core/client/api/Coupon';
import { useLocale, useTranslations } from 'next-intl';
import type { Pagination, SortState } from '@/shared/types/pagination';
import type { Coupon } from '@/shared/types/order';
import CouponModal from '../components/CouponModal';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

const couponState = (coupon: Coupon): { label: string; className: string } => {
  const now = Date.now();
  if (coupon.usedAt) return { label: 'redeemed', className: 'bg-body/10 text-body' };
  if (coupon.reservedOrderId) return { label: 'reserved', className: 'bg-meta-5/10 text-meta-5' };
  if (!coupon.isActive) return { label: 'paused', className: 'bg-body/10 text-body' };
  if (new Date(coupon.expirationDate).getTime() < now)
    return { label: 'expired', className: 'bg-danger/10 text-danger' };
  if (new Date(coupon.startDate).getTime() > now)
    return { label: 'upcoming', className: 'bg-meta-5/10 text-meta-5' };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { label: 'exhausted', className: 'bg-warning/10 text-warning' };
  }
  return { label: 'active', className: 'bg-success/10 text-success dark:text-emerald-300' };
};

const CouponList = () => {
  const t = useTranslations('adminCoupons');
  const locale = useLocale();
  const money = (value: number) => new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND' }).format(value);
  const formatDate = (value: string) => new Date(value).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US');
  const request = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CouponListParams['status']>('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: 'id', direction: 'desc' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadCoupons = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setLoadError(false);
    const result = await CouponApi.getCoupons({
      q: search,
      status,
      page,
      per_page: PAGE_SIZE,
      sort: sort.key,
      direction: sort.direction,
    });
    if (current !== request.current) return;
    setLoadError(!result);
    setCoupons(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [search, status, page, sort]);

  useEffect(() => {
    void loadCoupons();
    return () => { request.current++; };
  }, [loadCoupons]);

  const openModal = (coupon: Coupon | null) => {
    setEditing(coupon);
    setModalOpen(true);
  };

  const remove = async () => {
    if (!deleting || deleting.source === 'loyalty') return;
    setRemoveError(false);
    if (await CouponApi.deleteCoupon(deleting.id)) {
      setDeleting(null);
      void loadCoupons();
    } else setRemoveError(true);
  };

  const columns: DataTableColumn<Coupon>[] = [
    {
      key: 'code',
      header: t('code'),
      className: 'min-w-[120px]',
      sortable: true,
      render: (coupon) => <span className="font-semibold">{coupon.code}</span>,
    },
    { key: 'title', header: t('title'), className: 'min-w-[180px]' },
    {
      key: 'discountPercent',
      header: t('discount'),
      className: 'min-w-[180px]',
      sortable: true,
      render: (coupon) => (
        <div>
          <span className="font-medium">{coupon.fixedAmountVnd ? money(coupon.fixedAmountVnd) : `${coupon.discountPercent}%`}</span>
          {coupon.maxDiscountVnd != null && <p className="text-sm">{t('maximum', { amount: money(coupon.maxDiscountVnd) })}</p>}
          {coupon.minOrderVnd > 0 && <p className="text-sm">{t('minimum', { amount: money(coupon.minOrderVnd) })}</p>}
        </div>
      ),
    },
    { key: 'usageLimit', header: t('limit'), render: (coupon) => coupon.usageLimit ?? t('unlimited') },
    { key: 'usageCount', header: t('used'), sortable: true },
    { key: 'startDate', header: t('start'), className: 'whitespace-nowrap', sortable: true, render: (coupon) => formatDate(coupon.startDate) },
    {
      key: 'expirationDate',
      header: t('expiry'),
      className: 'whitespace-nowrap',
      sortable: true,
      render: (coupon) => formatDate(coupon.expirationDate),
    },
    {
      key: 'state',
      header: t('status'),
      className: 'min-w-[140px]',
      render: (coupon) => {
        const state = couponState(coupon);
        return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${state.className}`}>{t(state.label)}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'min-w-[160px]',
      render: (coupon) => coupon.source === 'loyalty' ? (
        <span className="text-sm text-body dark:text-bodydark">{t('reward')}</span>
      ) : (
        <div className="flex justify-end gap-4">
          <button onClick={() => openModal(coupon)} className="font-medium text-brand-hover hover:underline">
            {t('edit')}
          </button>
          <button onClick={() => { setRemoveError(false); setDeleting(coupon); }} className="font-medium text-danger hover:underline">
            {t('remove')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName={t('page')} />
      {loadError && <div role="alert" className="mb-4 rounded-lg border border-danger p-4">
        {t('loadError')} <button type="button" onClick={() => void loadCoupons()} className="font-semibold underline">{t('retry')}</button>
      </div>}
      <DataTable
        title={t('list')}
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-56`}
              placeholder={t('search')}
              aria-label={t('search')}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-44`}
              aria-label={t('status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CouponListParams['status']);
                setPage(1);
              }}
            >
              <option value="">{t('all')}</option>
              <option value="active">{t('active')}</option>
              <option value="expired">{t('expired')}</option>
              <option value="inactive">{t('paused')}</option>
            </select>
            <button
              onClick={() => openModal(null)}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              + {t('create')}
            </button>
          </>
        }
        columns={columns}
        data={coupons}
        rowKey={(coupon) => coupon.id}
        loading={loading}
        emptyText={loadError ? t('loadError') : t('empty')}
        sort={sort}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        pagination={pagination}
        onPageChange={setPage}
      />

      <CouponModal
        open={modalOpen}
        coupon={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          loadCoupons();
        }}
      />
      <ConfirmModal
        open={!!deleting}
        title={t('removeTitle')}
        message={
          <>
            {t('removeMessage', { code: deleting?.code || '' })}
            {removeError && <p role="alert" className="mt-3 text-danger">{t('removeError')}</p>}
          </>
        }
        confirmLabel={t('remove')}
        danger
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
};

export default CouponList;
