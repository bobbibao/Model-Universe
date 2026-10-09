'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Modal from '@/components/Modal/Modal';
import { inputClassName } from '@/components/FormElements/TextField';
import { MODEL_RETURN_REASONS } from '@/shared/return-rules';
import Api from '@/core/client/api/Api';
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

// The customer picks the lines, quantities and reasons to return from a delivered order.
const ReturnRequestModal = ({ open, order, info, onClose, onCreated }: ReturnRequestModalProps) => {
  const t = useTranslations('returns'),
    common = useTranslations('common');
  const [lines, setLines] = useState<Record<number, LineDraft>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [evidence, setEvidence] = useState<{ id: number; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLines({});
    setNote('');
    setError('');
    setEvidence([]);
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
    if (selected.length === 0) return setError(t('selectLine'));
    if (selected.some(([, line]) => !line.reason)) return setError(t('selectReasons'));
    setSubmitting(true);
    const created = await ReturnApi.createReturn({
      orderId: order.id,
      items: selected.map(([orderItemId, line]) => ({
        orderItemId: Number(orderItemId),
        quantity: line.quantity,
        reason: line.reason as ReturnReason,
      })),
      note: note.trim(),
      ...(evidence.length ? { evidenceIds: evidence.map((file) => file.id) } : {}),
    });
    setSubmitting(false);
    if (created) onCreated();
  };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const element = event.target,
      file = element.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'return');
      const saved = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
      setEvidence((current) => [...current, { id: saved.id, name: file.name }]);
    } catch {
      /* Shared API reports file validation. */
    } finally {
      setUploading(false);
      element.value = '';
    }
  };

  return (
    <Modal open={open} title={t('requestTitle', { id: order.id })} onClose={onClose} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-body">{t('intro')}</p>
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
                <p className="text-sm text-body">{t('allRequested')}</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    {t('quantity', { max })}
                    <select
                      className={`${inputClassName} mt-1 !py-2`}
                      value={line.quantity}
                      onChange={(event) => update(item.id, { quantity: Number(event.target.value) })}
                    >
                      {Array.from({ length: max + 1 }, (_, quantity) => (
                        <option key={quantity} value={quantity}>
                          {quantity === 0 ? t('noReturn') : quantity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    {t('reason')}
                    <select
                      className={`${inputClassName} mt-1 !py-2`}
                      value={line.reason}
                      disabled={line.quantity === 0}
                      onChange={(event) => update(item.id, { reason: event.target.value as ReturnReason })}
                    >
                      <option value="">{t('chooseReason')}</option>
                      {MODEL_RETURN_REASONS.map((value) => (
                        <option key={value} value={value}>
                          {t(`reasons.${value}`)}
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
          {t('note')}
          <textarea
            rows={3}
            maxLength={1000}
            className={`${inputClassName} mt-1`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <label className="mu-field">
          {t('evidence')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading || evidence.length >= 12}
            onChange={(event) => void upload(event)}
          />
        </label>
        <p className="mu-note">{t('evidenceNote')}</p>
        {uploading && (
          <p className="mu-note" role="status">
            {common('processing')}
          </p>
        )}
        {evidence.map((file) => (
          <p className="mu-note" key={file.id}>
            {file.name}
          </p>
        ))}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 font-medium text-body hover:underline"
          >
            {common('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || uploading}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {submitting ? common('processing') : common('submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReturnRequestModal;
