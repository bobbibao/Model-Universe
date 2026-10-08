'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useCustomerActionRefresh from '@/hooks/useCustomerActionRefresh';
import ReturnStatusBadge from '@/components/ReturnStatusBadge';
import ReturnApi from '@/core/client/api/Return';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order } from '@/shared/types/order';
import type { OrderReturnInfo } from '@/shared/types/return';
import ReturnRequestModal from './ReturnRequestModal';
import SupportResolution from './SupportResolution';

// Returns of a delivered order: the request button while the return window is open, and existing requests.
const OrderReturns = ({ order }: { order: Order }) => {
  const t = useTranslations('returns'),
    support = useTranslations('supportResolution'),
    common = useTranslations('common'),
    locale = useLocale();
  const [info, setInfo] = useState<OrderReturnInfo>();
  const [modalOpen, setModalOpen] = useState(false);
  const [openCase, setOpenCase] = useState<number | null>(null);

  const load = useCallback(async () => setInfo(await ReturnApi.getForOrder(order.id)), [order.id]);

  useEffect(() => {
    load();
  }, [load]);
  useCustomerActionRefresh('return_request', load);

  if (!info) return null;
  const anythingLeft = info.lines.some((line) => line.returnable > 0);

  return (
    <div className="mt-6 border-t border-stroke pt-4 dark:border-store-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold">{t('title')}</h4>
          <p className="text-sm text-body dark:text-store-muted">
            {info.canRequest && info.deadline
              ? t('deadline', { date: new Date(info.deadline).toLocaleDateString(locale) })
              : t(order.status === 'DELIVERED' ? 'windowClosed' : 'notDelivered')}
          </p>
        </div>
        {info.canRequest && anythingLeft && (
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-md border border-brand-hover px-4 py-2 font-medium text-brand-hover hover:bg-brand hover:text-brand-ink"
          >
            {t('request')}
          </button>
        )}
      </div>

      {info.returns.map((request) => (
        <div key={request.id} className="mt-3 rounded border border-stroke p-3 text-sm dark:border-store-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span>
              {t('case', { id: request.id })} · {new Date(request.createdAt).toLocaleDateString(locale)}
            </span>
            {request.resolutionStatus ? <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">{support(`state.${request.resolutionStatus}`)}</span> : <ReturnStatusBadge status={request.status} />}
          </div>
          <ul className="flex flex-col gap-1">
            {request.items.map((item) => (
              <li key={item.id}>
                {item.orderItem.productName} × {item.quantity} · {t(`reasons.${item.reason}`)}
                {item.refundAmount !== null && request.status === 'RECEIVED' && (
                  <span className="font-medium">
                    {' '}
                    · {t('proposedRefund', { amount: formatVND(item.refundAmount, locale) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {request.status === 'REJECTED' && request.adminNote && (
            <p className="mt-2 text-danger">{t('rejection', { reason: request.adminNote })}</p>
          )}
          <button
            className="mu-button mu-button-secondary mt-4"
            aria-expanded={openCase === request.id}
            onClick={() => setOpenCase(openCase === request.id ? null : request.id)}
          >
            {common('details')}
          </button>
          {openCase === request.id && <SupportResolution id={request.id} />}
        </div>
      ))}

      <ReturnRequestModal
        open={modalOpen}
        order={order}
        info={info}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
};

export default OrderReturns;
