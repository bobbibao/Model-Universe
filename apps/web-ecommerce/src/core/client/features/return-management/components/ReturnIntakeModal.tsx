'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal/Modal';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import { inputClassName } from '@/components/FormElements/TextField';
import ReturnStatusBadge, { RETURN_CONDITION_LABELS, RETURN_REASON_LABELS } from '@/components/ReturnStatusBadge';
import ReturnApi from '@/core/client/api/Return';
import { formatVND } from '@/shared/server/utils/utils';
import type { ReturnCondition, ReturnItem, ReturnRequest } from '@/shared/types/return';

interface ReturnIntakeModalProps {
  returnId: number | null;
  onClose: () => void;
  onChanged: () => void;
}

type LineDraft = { condition: ReturnCondition | ''; refundAmount: string };

const CONDITIONS = Object.entries(RETURN_CONDITION_LABELS) as [ReturnCondition, string][];
const RESTOCKABLE: ReturnCondition[] = ['new', 'open_box'];

const maxRefund = (item: ReturnItem) => item.orderItem.unitPrice * item.quantity;

// Intake of a return: receive it (condition and refund per line) or reject it. Neither changes stock; received
// lines in sellable condition can then be put back into stock one by one ("Nhập lại kho").
const ReturnIntakeModal = ({ returnId, onClose, onChanged }: ReturnIntakeModalProps) => {
  const [request, setRequest] = useState<ReturnRequest>();
  const [lines, setLines] = useState<Record<number, LineDraft>>({});
  const [adminNote, setAdminNote] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'RECEIVED' | 'REJECTED' | null>(null);
  const [restocking, setRestocking] = useState<ReturnItem | null>(null);

  useEffect(() => {
    setRequest(undefined);
    setError('');
    setAdminNote('');
    if (returnId === null) return;
    ReturnApi.getReturn(returnId).then((result) => {
      setRequest(result);
      setLines(
        Object.fromEntries(
          (result?.items || []).map((item) => [item.id, { condition: '', refundAmount: String(maxRefund(item)) }]),
        ),
      );
    });
  }, [returnId]);

  const applyResult = (result?: ReturnRequest) => {
    if (!result) return;
    setRequest(result);
    onChanged();
  };

  const requestDecision = (decision: 'RECEIVED' | 'REJECTED') => {
    setError('');
    if (!request) return;
    if (decision === 'REJECTED' && !adminNote.trim()) return setError('Vui lòng ghi lý do từ chối.');
    if (decision === 'RECEIVED') {
      for (const item of request.items) {
        const line = lines[item.id];
        const refund = Number(line?.refundAmount);
        if (!line?.condition) return setError(`${item.orderItem.productName}: chọn tình trạng hàng.`);
        if (!Number.isInteger(refund) || refund < 0 || refund > maxRefund(item)) {
          return setError(`${item.orderItem.productName}: số tiền hoàn từ 0 đến ${formatVND(maxRefund(item))}.`);
        }
      }
    }
    setConfirm(decision);
  };

  const submit = async () => {
    if (!request || !confirm) return;
    const result = await ReturnApi.intake(request.id, {
      decision: confirm,
      adminNote: adminNote.trim(),
      items: request.items.map((item) => ({
        id: item.id,
        condition: lines[item.id].condition as ReturnCondition,
        refundAmount: Number(lines[item.id].refundAmount),
      })),
    });
    setConfirm(null);
    applyResult(result);
  };

  const restock = async () => {
    if (!request || !restocking) return;
    const result = await ReturnApi.restock(request.id, restocking.id);
    setRestocking(null);
    applyResult(result);
  };

  const waiting = request?.status === 'REQUESTED';

  return (
    <Modal open={returnId !== null} title={`Yêu cầu trả hàng #${returnId ?? ''}`} onClose={onClose} size="lg">
      {!request ? (
        <div className="flex justify-center py-10">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Đơn hàng{' '}
              <Link href={`/admin/orders/${request.orderId}`} className="font-medium text-brand-hover hover:underline">
                #{request.orderId}
              </Link>{' '}
              · {request.user ? `${request.user.lastName} ${request.user.firstName}` : ''} · Gửi lúc{' '}
              {new Date(request.createdAt).toLocaleString('vi-VN')}
            </span>
            <ReturnStatusBadge status={request.status} />
          </div>
          {request.customerNote && <p className="italic">Khách hàng ghi chú: “{request.customerNote}”</p>}

          {request.items.map((item) => (
            <div key={item.id} className="rounded border border-stroke p-3 dark:border-strokedark">
              <p className="font-medium">
                {item.orderItem.productName} × {item.quantity}
                {item.orderItem.size && <span className="text-body"> · Size {item.orderItem.size}</span>}
              </p>
              <p className="text-body">
                Lý do: {RETURN_REASON_LABELS[item.reason]} · Đơn giá {formatVND(item.orderItem.unitPrice)}
              </p>
              {waiting ? (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    Tình trạng hàng nhận về
                    <select
                      className={`${inputClassName} mt-1 !py-2`}
                      value={lines[item.id]?.condition || ''}
                      onChange={(event) =>
                        setLines({
                          ...lines,
                          [item.id]: { ...lines[item.id], condition: event.target.value as ReturnCondition },
                        })
                      }
                    >
                      <option value="">Chọn tình trạng</option>
                      {CONDITIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Hoàn tiền (VNĐ, tối đa {formatVND(maxRefund(item))})
                    <input
                      inputMode="numeric"
                      className={`${inputClassName} mt-1 !py-2`}
                      value={lines[item.id]?.refundAmount || ''}
                      onChange={(event) =>
                        setLines({
                          ...lines,
                          [item.id]: { ...lines[item.id], refundAmount: event.target.value.replace(/\D/g, '') },
                        })
                      }
                    />
                  </label>
                </div>
              ) : (
                request.status === 'RECEIVED' && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {item.condition && RETURN_CONDITION_LABELS[item.condition]} · Hoàn{' '}
                      {formatVND(item.refundAmount ?? 0)}
                    </span>
                    {item.restockedAt ? (
                      <span className="text-success">
                        Đã nhập lại kho {new Date(item.restockedAt).toLocaleDateString('vi-VN')}
                      </span>
                    ) : item.condition && RESTOCKABLE.includes(item.condition) ? (
                      <button
                        onClick={() => setRestocking(item)}
                        className="rounded-md border border-brand-hover px-3 py-1.5 font-medium text-brand-hover hover:bg-brand hover:text-brand-ink"
                      >
                        Nhập lại kho
                      </button>
                    ) : (
                      <span className="text-body">Không nhập lại kho (hư hỏng)</span>
                    )}
                  </div>
                )
              )}
            </div>
          ))}

          {waiting ? (
            <>
              <label>
                Ghi chú (bắt buộc khi từ chối)
                <textarea
                  rows={2}
                  maxLength={1000}
                  className={`${inputClassName} mt-1`}
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                />
              </label>
              <p className="text-body">
                Nhận hàng chỉ ghi nhận tình trạng và số tiền hoàn; tồn kho không thay đổi cho đến khi bạn bấm &quot;Nhập
                lại kho&quot;. Tiền hoàn trả cho khách ngoài hệ thống.
              </p>
              {error && <p className="text-danger">{error}</p>}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => requestDecision('REJECTED')}
                  className="rounded-md border border-danger px-4 py-2 font-medium text-danger hover:bg-danger hover:text-white"
                >
                  Từ chối
                </button>
                <button
                  onClick={() => requestDecision('RECEIVED')}
                  className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
                >
                  Nhận hàng
                </button>
              </div>
            </>
          ) : (
            request.adminNote && <p>Ghi chú của cửa hàng: {request.adminNote}</p>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm === 'REJECTED' ? 'Từ chối yêu cầu trả hàng' : 'Xác nhận đã nhận hàng'}
        message={
          confirm === 'REJECTED'
            ? 'Từ chối yêu cầu này? Không thể thay đổi sau khi xác nhận.'
            : 'Ghi nhận đã nhận hàng với tình trạng và số tiền hoàn đã nhập? Không thể thay đổi sau khi xác nhận.'
        }
        confirmLabel={confirm === 'REJECTED' ? 'Từ chối' : 'Nhận hàng'}
        danger={confirm === 'REJECTED'}
        onConfirm={submit}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={!!restocking}
        title="Nhập lại kho"
        message={
          <>
            Nhập lại <strong>{restocking?.quantity}</strong> sản phẩm{' '}
            <strong>{restocking?.orderItem.productName}</strong> vào kho? Tồn kho của sản phẩm sẽ tăng thêm{' '}
            {restocking?.quantity}.
          </>
        }
        confirmLabel="Nhập lại kho"
        onConfirm={restock}
        onClose={() => setRestocking(null)}
      />
    </Modal>
  );
};

export default ReturnIntakeModal;
