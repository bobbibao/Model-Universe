'use client';

import { FormEvent, useEffect, useState } from 'react';
import Modal from '@/components/Modal/Modal';
import { inputClassName } from '@/components/FormElements/TextField';
import { RETURN_REASON_LABELS } from '@/components/ReturnStatusBadge';
import ReturnApi from '@/core/client/api/Return';
import type { Order } from '@/shared/types/order';
import type { OrderReturnInfo, ReturnReason } from '@/shared/types/return';

interface ReturnRequestModalProps {
  open: boolean;
  order: Order;
  info: OrderReturnInfo;
  onClose: () => void;
  onCreated: () => void;
}

type LineDraft = { quantity: number; reason: ReturnReason | '' };

const REASONS = Object.entries(RETURN_REASON_LABELS) as [ReturnReason, string][];

// The customer picks the lines, quantities and reasons to return from a delivered order.
const ReturnRequestModal = ({ open, order, info, onClose, onCreated }: ReturnRequestModalProps) => {
  const [lines, setLines] = useState<Record<number, LineDraft>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLines({});
    setNote('');
    setError('');
  }, [open]);

  const returnable = (orderItemId: number) =>
    info.lines.find((line) => line.orderItemId === orderItemId)?.returnable ?? 0;

  const update = (orderItemId: number, change: Partial<LineDraft>) =>
    setLines((current) => ({
      ...current,
      [orderItemId]: { ...(current[orderItemId] || { quantity: 0, reason: '' }), ...change },
    }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selected = Object.entries(lines).filter(([, line]) => line.quantity > 0);
    if (selected.length === 0) return setError('Vui lòng chọn ít nhất một sản phẩm để trả.');
    if (selected.some(([, line]) => !line.reason)) return setError('Vui lòng chọn lý do cho từng sản phẩm.');
    setSubmitting(true);
    const created = await ReturnApi.createReturn({
      orderId: order.id,
      items: selected.map(([orderItemId, line]) => ({
        orderItemId: Number(orderItemId),
        quantity: line.quantity,
        reason: line.reason as ReturnReason,
      })),
      note: note.trim(),
    });
    setSubmitting(false);
    if (created) onCreated();
  };

  return (
    <Modal open={open} title={`Yêu cầu trả hàng · Đơn #${order.id}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-body">
          Chọn số lượng muốn trả cho từng sản phẩm. Sau khi cửa hàng nhận và kiểm tra hàng, bạn sẽ được hoàn tiền.
        </p>
        {(order.items || []).map((item) => {
          const max = returnable(item.id);
          const line = lines[item.id] || { quantity: 0, reason: '' };
          return (
            <div key={item.id} className="rounded border border-stroke p-3 dark:border-strokedark">
              <p className="font-medium">
                {item.productName}
                {item.size && <span className="text-body"> · Size {item.size}</span>}
              </p>
              {max === 0 ? (
                <p className="text-sm text-body">Đã yêu cầu trả hết số lượng của sản phẩm này.</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Số lượng trả (tối đa {max})
                    <select
                      className={`${inputClassName} mt-1 !py-2`}
                      value={line.quantity}
                      onChange={(event) => update(item.id, { quantity: Number(event.target.value) })}
                    >
                      {Array.from({ length: max + 1 }, (_, quantity) => (
                        <option key={quantity} value={quantity}>
                          {quantity === 0 ? 'Không trả' : quantity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Lý do
                    <select
                      className={`${inputClassName} mt-1 !py-2`}
                      value={line.reason}
                      disabled={line.quantity === 0}
                      onChange={(event) => update(item.id, { reason: event.target.value as ReturnReason })}
                    >
                      <option value="">Chọn lý do</option>
                      {REASONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          );
        })}
        <label className="text-sm">
          Ghi chú cho cửa hàng (không bắt buộc)
          <textarea
            rows={3}
            maxLength={1000}
            className={`${inputClassName} mt-1`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 font-medium text-body hover:underline"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReturnRequestModal;
