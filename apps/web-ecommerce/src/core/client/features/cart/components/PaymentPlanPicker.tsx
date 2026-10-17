'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCheckoutDraft } from '@/shared/client/providers/CheckoutDraftProvider';
import { formatVND } from '@/shared/server/utils/utils';
import { DEPOSIT_PRESETS, depositForPercent, type PaymentPlan } from '@/shared/payment';

// The upfront payment and COD balance for the draft's payment plan and an order total. The deposit percentage applies
// to the merchandise (`basis`); the shipping fee is paid with the balance.
export function useUpfrontPayment(total: number, basis = total, floor = 0) {
  const { paymentPlan, depositPercent } = useCheckoutDraft();
  const upfront = paymentPlan === 'full' ? total : depositForPercent(total, depositPercent, basis, floor);
  return {
    paymentPlan,
    depositVnd: paymentPlan === 'deposit' ? upfront : undefined,
    upfrontVnd: upfront,
    balanceVnd: total - upfront,
  };
}

// Checkout payment choice: a deposit (10%, 30% or 50%, transfer now, rest COD) or the full amount by transfer.
export default function PaymentPlanPicker({
  total,
  basis = total,
  floor = 0,
  compact = false,
}: {
  total: number;
  basis?: number;
  floor?: number;
  compact?: boolean;
}) {
  const t = useTranslations('checkout.payment'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const { paymentPlan, setPaymentPlan, depositPercent, setDepositPercent } = useCheckoutDraft();
  const { upfrontVnd, balanceVnd } = useUpfrontPayment(total, basis, floor);
  const option = (plan: PaymentPlan, title: string, detail: string) => (
    <label className={`payment-plan-option${paymentPlan === plan ? ' is-selected' : ''}`}>
      <input type="radio" name="payment-plan" checked={paymentPlan === plan} onChange={() => setPaymentPlan(plan)} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
  return (
    <fieldset className={`payment-plan${compact ? ' is-compact' : ''}`}>
      <legend>{t('title')}</legend>
      {option('deposit', t('deposit'), t('depositHint'))}
      {paymentPlan === 'deposit' && (
        <div className="payment-plan-presets" role="group" aria-label={t('depositAmount')}>
          {DEPOSIT_PRESETS.map((percent) => (
            <button
              key={percent}
              type="button"
              aria-pressed={depositPercent === percent}
              onClick={() => setDepositPercent(percent)}
            >
              {percent}%<small>{money(depositForPercent(total, percent, basis, floor))}</small>
            </button>
          ))}
        </div>
      )}
      {option('full', t('full'), t('fullHint'))}
      <dl className="payment-plan-split" aria-live="polite">
        <div>
          <dt>{t('transferNow')}</dt>
          <dd>{money(upfrontVnd)}</dd>
        </div>
        <div>
          <dt>{t('codLater')}</dt>
          <dd>{balanceVnd > 0 ? money(balanceVnd) : t('nothingLater')}</dd>
        </div>
      </dl>
      <p className="payment-plan-note">{t('note')}</p>
    </fieldset>
  );
}
