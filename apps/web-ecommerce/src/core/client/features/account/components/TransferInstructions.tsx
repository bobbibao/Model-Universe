'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order } from '@/shared/types/order';

// What the customer transfers while an order's deposit or full payment is outstanding. The shop verifies the actual
// incoming transfer before shipping; a screenshot alone is not a payment.
export default function TransferInstructions({ order }: { order: Order }) {
  const t = useTranslations('checkout.payment'),
    locale = useLocale();
  const info = order.transferInstructions;
  if (!info) return null;
  const copy = (value: string) => void navigator.clipboard?.writeText(value).catch(() => undefined);
  const row = (label: string, value: string, copyable = false) => (
    <div>
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        {copyable && (
          <button type="button" onClick={() => copy(value)} aria-label={t('copy', { label })}>
            {t('copyShort')}
          </button>
        )}
      </dd>
    </div>
  );
  return (
    <section className="transfer-instructions" aria-labelledby={`transfer-${order.id}`}>
      <h3 id={`transfer-${order.id}`}>{order.paymentPlan === 'full' ? t('awaitingFull') : t('awaitingDeposit')}</h3>
      <dl>
        {row(t('amount'), formatVND(info.amountVnd, locale), true)}
        {row(t('memo'), info.memo, true)}
        {info.account && (
          <>
            {row(t('bank'), info.account.bankName)}
            {row(t('accountNumber'), info.account.accountNumber, true)}
            {row(t('accountHolder'), info.account.accountHolder)}
          </>
        )}
      </dl>
      <p>{info.account ? t('verifyNote') : t('accountPending')}</p>
    </section>
  );
}
