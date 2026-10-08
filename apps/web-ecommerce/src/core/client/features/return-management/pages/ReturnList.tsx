'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import ReturnStatusBadge, { RETURN_STATUS_LABELS } from '@/components/ReturnStatusBadge';
import ReturnApi, { ReturnListParams } from '@/core/client/api/Return';
import { formatVND } from '@/shared/server/utils/utils';
import type { Pagination } from '@/shared/types/pagination';
import type { ReturnRequest, ReturnStatus } from '@/shared/types/return';
import ReturnIntakeModal from '../components/ReturnIntakeModal';

const PAGE_SIZE = 10;

const refundTotal = (request: ReturnRequest) => request.items.reduce((sum, item) => sum + (item.refundAmount ?? 0), 0);

const ReturnList = () => {
  const t = useTranslations('returns'),
    support = useTranslations('supportResolution'),
    common = useTranslations('common'),
    locale = useLocale();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ReturnListParams['status']>('REQUESTED');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await ReturnApi.getReturns({ status, page, per_page: PAGE_SIZE });
    setReturns(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: DataTableColumn<ReturnRequest>[] = [
    { key: 'id', header: t('id'), render: (request) => `#${request.id}` },
    { key: 'orderId', header: t('order'), render: (request) => `#${request.orderId}` },
    {
      key: 'customer',
      header: t('customer'),
      render: (request) => (request.user ? `${request.user.lastName} ${request.user.firstName}` : '—'),
    },
    {
      key: 'items',
      header: t('items'),
      className: 'min-w-[240px]',
      render: (request) => (
        <ul className="text-sm">
          {request.items.map((item) => (
            <li key={item.id}>
              {item.orderItem.productName} × {item.quantity} · {t(`reasons.${item.reason}`)}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: 'refund',
      header: t('proposedRefundHeader'),
      render: (request) => (request.status === 'RECEIVED' ? formatVND(refundTotal(request), locale) : '—'),
    },
    {
      key: 'createdAt',
      header: t('submitted'),
      render: (request) => new Date(request.createdAt).toLocaleString(locale),
    },
    { key: 'status', header: common('status'), render: (request) => <ReturnStatusBadge status={request.status} /> },
    { key: 'resolution', header: support('title'), render: (request) => request.resolutionStatus ? support(`state.${request.resolutionStatus}`) : '—' },
  ];

  return (
    <>
      <Breadcrumb pageName={t('title')} />
      <DataTable
        title={t('listTitle')}
        actions={
          <select
            className={`${inputClassName} !py-2 sm:w-44`}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ReturnListParams['status']);
              setPage(1);
            }}
          >
            {(Object.keys(RETURN_STATUS_LABELS) as ReturnStatus[]).map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
            <option value="">{t('all')}</option>
          </select>
        }
        columns={columns}
        data={returns}
        rowKey={(request) => request.id}
        loading={loading}
        emptyText={t('empty')}
        onRowClick={(request) => setOpenId(request.id)}
        pagination={pagination}
        onPageChange={setPage}
      />
      <ReturnIntakeModal returnId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </>
  );
};

export default ReturnList;
