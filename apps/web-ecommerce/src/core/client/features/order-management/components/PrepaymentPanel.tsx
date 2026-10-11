'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import OrderApi from '@/core/client/api/Order';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order, OrderPrepayment } from '@/shared/types/order';

// Staff record of a checkout payment plan's upfront transfer (deposit or full payment), and of its refund once a
// prepaid order is cancelled. Each is recorded once from the actual bank transaction.
export default function PrepaymentPanel({ order, onChange }: { order: Order; onChange: (order: Order) => void }) {
  const t = useTranslations('orderOperations.prepayment'),
    ops = useTranslations('orderOperations'),
    locale = useLocale();
  const [busy, setBusy] = useState(false);
  if (!order.paymentPlan) return null;
  const money = (amount: number) => formatVND(amount, locale);
  const due = order.upfrontDueVnd || 0,
    prepaid = order.prepaidVnd || 0;
  const receipt = order.prepayments?.find((row) => row.kind === 'receipt');
  const refund = order.prepayments?.find((row) => row.kind === 'refund');
  const kind: OrderPrepayment['kind'] | null =
    !receipt && order.status === 'PROCESSING'
      ? 'receipt'
      : receipt && !refund && order.status === 'CANCELLED'
        ? 'refund'
        : null;
  const record = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!kind) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await OrderApi.recordPrepayment(order.id, {
        kind,
        amountVnd: Number(form.get('amountVnd')),
        externalReference: String(form.get('externalReference')),
        reason: String(form.get('reason')),
        moneyVerified: form.has('moneyVerified'),
      });
      if (result) onChange(result);
    } finally {
      setBusy(false);
    }
  };
  const entry = (row: OrderPrepayment) => (
    <div key={row.id} className="prepayment-entry">
      <strong>
        {t(row.kind === 'receipt' ? 'received' : 'refunded')} · {money(row.amountVnd)}
      </strong>
      <span className="break-all">{row.externalReference}</span>
      <span>{new Date(row.createdAt).toLocaleString(locale)}</span>
      <span>{row.reason}</span>
    </div>
  );
  return (
    <section className="mu-panel space-y-4 p-5" aria-labelledby={`prepayment-${order.id}`}>
      <h2 id={`prepayment-${order.id}`} className="text-xl font-bold">
        {t('title')}
      </h2>
      <dl className="prepayment-facts">
        <div>
          <dt>{t('plan')}</dt>
          <dd>{t(order.paymentPlan === 'full' ? 'planFull' : 'planDeposit')}</dd>
        </div>
        <div>
          <dt>{t('due')}</dt>
          <dd>{money(due)}</dd>
        </div>
        <div>
          <dt>{t('codBalance')}</dt>
          <dd>{money(Math.max(0, order.total - Math.max(prepaid, due)))}</dd>
        </div>
        <div>
          <dt>{t('memo')}</dt>
          <dd>{order.transferInstructions?.memo || `MU${order.id}`}</dd>
        </div>
      </dl>
      {receipt && entry(receipt)}
      {refund && entry(refund)}
      {!receipt && order.status === 'PROCESSING' && <p className="prepayment-warning">{t('blocksShipping')}</p>}
      {order.status === 'CANCELLED' && receipt && !refund && <p className="prepayment-warning">{t('refundDue')}</p>}
      {kind && (
        <form
          className="space-y-4"
          onSubmit={(event) => void record(event)}
          aria-label={t(kind === 'receipt' ? 'recordReceipt' : 'recordRefund')}
        >
          <label className="mu-field">
            {ops('amount')}
            <input
              name="amountVnd"
              type="number"
              step="1"
              min={kind === 'receipt' ? due : prepaid}
              max={kind === 'receipt' ? order.total : prepaid}
              required
              defaultValue={kind === 'receipt' ? due : prepaid}
              readOnly={kind === 'refund'}
            />
          </label>
          <label className="mu-field">
            {ops('reference')}
            <input name="externalReference" minLength={8} maxLength={128} required />
          </label>
          <label className="mu-field">
            {ops('reason')}
            <textarea name="reason" maxLength={1000} required />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" name="moneyVerified" type="checkbox" required />
            {ops('verified')}
          </label>
          <button className="mu-button" disabled={busy}>
            {t(kind === 'receipt' ? 'recordReceipt' : 'recordRefund')}
          </button>
        </form>
      )}
    </section>
  );
}
