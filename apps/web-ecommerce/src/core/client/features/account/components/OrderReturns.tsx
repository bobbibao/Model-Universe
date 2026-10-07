'use client';

import { useCallback, useEffect, useState } from 'react';
import useCustomerActionRefresh from '@/hooks/useCustomerActionRefresh';
import ReturnStatusBadge, { RETURN_REASON_LABELS } from '@/components/ReturnStatusBadge';
import ReturnApi from '@/core/client/api/Return';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order } from '@/shared/types/order';
import type { OrderReturnInfo } from '@/shared/types/return';
import ReturnRequestModal from './ReturnRequestModal';

// Returns of a delivered order: the request button while the return window is open, and existing requests.
const OrderReturns = ({ order }: { order: Order }) => {
  const [info, setInfo] = useState<OrderReturnInfo>();
  const [modalOpen, setModalOpen] = useState(false);

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
          <h4 className="font-semibold">Trả hàng</h4>
          <p className="text-sm text-body dark:text-store-muted">
            {info.canRequest && info.deadline
              ? `Có thể yêu cầu trả hàng đến ${new Date(info.deadline).toLocaleDateString('vi-VN')}.`
              : info.blockedReason}
          </p>
        </div>
        {info.canRequest && anythingLeft && (
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-md border border-brand-hover px-4 py-2 font-medium text-brand-hover hover:bg-brand hover:text-brand-ink"
          >
            Yêu cầu trả hàng
          </button>
        )}
      </div>

      {info.returns.map((request) => (
        <div key={request.id} className="mt-3 rounded border border-stroke p-3 text-sm dark:border-store-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span>
              Yêu cầu #{request.id} · {new Date(request.createdAt).toLocaleDateString('vi-VN')}
            </span>
            <ReturnStatusBadge status={request.status} />
          </div>
          <ul className="flex flex-col gap-1">
            {request.items.map((item) => (
              <li key={item.id}>
                {item.orderItem.productName} × {item.quantity} · {RETURN_REASON_LABELS[item.reason]}
                {item.refundAmount !== null && request.status === 'RECEIVED' && (
                  <span className="font-medium"> · Hoàn {formatVND(item.refundAmount)}</span>
                )}
              </li>
            ))}
          </ul>
          {request.status === 'REJECTED' && request.adminNote && (
            <p className="mt-2 text-danger">Lý do từ chối: {request.adminNote}</p>
          )}
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
