'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import type { PartnerListing } from '@/shared/types/partner';

interface Guarantee {
  id: number;
  listingVersion: number;
  requiredVnd: number;
  productValueVnd: number;
  heldVnd: number;
  cancelled: boolean;
  terms: {
    policyVersion: number;
    settings: { guaranteeRounding: string };
    bank: { bankName: string; bankAccount: string; accountHolder: string };
  };
  payments: {
    id: number;
    kind: 'receipt' | 'refund';
    amountVnd: number;
    externalReference: string;
    reason: string;
    createdAt: string;
  }[];
}
interface GuaranteeDetail {
  quote: {
    requiredVnd: number;
    productValueVnd: number;
    policyVersion: number;
    settings: { guaranteeRounding: string };
  } | null;
  policyRequired: boolean;
  guarantees: Guarantee[];
}

export default function PartnerGuarantee({
  listing,
  admin,
  onLockChange,
}: {
  listing: PartnerListing;
  admin: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const t = useTranslations('partnerGuarantee'),
    common = useTranslations('common'),
    locale = useLocale();
  const [detail, setDetail] = useState<GuaranteeDetail | null>(null),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const prefix = `${admin ? '/admin/partner-listings' : '/partners/listings'}/${listing.id}/guarantee`;
  const load = useCallback(async () => {
    try {
      setDetail((await Api.get(prefix)).data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [prefix]);
  useEffect(() => {
    void load();
  }, [load, listing.listingVersion]);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' }).format(value);
  const active = detail?.guarantees.find(
    (row) => !row.cancelled && !row.payments.some((payment) => payment.kind === 'refund'),
  );
  useEffect(() => {
    onLockChange(!detail || Boolean(active));
  }, [detail, active, onLockChange]);
  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      setDetail((await Api.post(prefix, body)).data);
    } catch {
      /* Keep accepted terms visible; refresh resolves uncertain bank confirmations. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="mu-panel space-y-5 p-6" aria-label={t('title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="mu-heading text-2xl">{t('title')}</h2>
        <button type="button" className="mu-button-secondary" disabled={busy} onClick={() => void load()}>
          {common('refresh')}
        </button>
      </div>
      <p className="mu-note">{t('intro')}</p>
      {failed ? (
        <button className="mu-button-secondary" onClick={() => void load()}>
          {common('refresh')}
        </button>
      ) : !detail ? (
        <p role="status">{common('loading')}</p>
      ) : (
        <>
          {detail.policyRequired && (
            <p role="status" className="mu-note">
              {t('policyPending')}
            </p>
          )}
          {!admin && !active && detail.quote && listing.listingStatus === 'approved' && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void submit({
                  action: 'accept',
                  termsAccepted: data.get('termsAccepted') === 'on',
                  expectedVersion: listing.listingVersion,
                  policyVersion: detail.quote!.policyVersion,
                  requiredVnd: detail.quote!.requiredVnd,
                });
              }}
            >
              <dl className="mu-note space-y-2">
                <div>
                  <dt>{t('value')}</dt>
                  <dd className="font-semibold">{money(detail.quote.productValueVnd)}</dd>
                </div>
                <div>
                  <dt>{t('required')}</dt>
                  <dd className="font-semibold">{money(detail.quote.requiredVnd)}</dd>
                </div>
                <div>
                  <dt>{t('policyVersion', { version: detail.quote.policyVersion })}</dt>
                  <dd>{t(`rounding.${detail.quote.settings.guaranteeRounding}`)}</dd>
                </div>
              </dl>
              <p className="mu-note">{t('refundTerms')}</p>
              <label className="flex gap-3">
                <input type="checkbox" name="termsAccepted" required />
                {t('consent')}
              </label>
              <button className="mu-button" disabled={busy}>
                {t('accept')}
              </button>
            </form>
          )}
          {detail.guarantees.length === 0 && !detail.quote && <p className="mu-note">{t('empty')}</p>}
          {detail.guarantees.map((row) => (
            <section key={row.id} className="space-y-3 border-t border-store-muted/20 pt-4">
              <h3 className="font-semibold">{t('record', { id: row.id, version: row.listingVersion })}</h3>
              <p className="mu-note">
                {t('required')}: {money(row.requiredVnd)} · {t('held')}: <strong>{money(row.heldVnd)}</strong>
              </p>
              <p className="mu-note">
                {t('policyVersion', { version: row.terms.policyVersion })} ·{' '}
                {t(`rounding.${row.terms.settings.guaranteeRounding}`)}
              </p>
              <p className="mu-note break-words">
                {t('bank')}: {row.terms.bank.bankName} · {row.terms.bank.bankAccount} · {row.terms.bank.accountHolder}
              </p>
              {row.cancelled && <p role="status">{t('cancelled')}</p>}
              {!admin && !row.cancelled && row.payments.length === 0 && (
                <button
                  className="mu-button-secondary"
                  disabled={busy}
                  onClick={() => void submit({ action: 'cancel', guaranteeId: row.id })}
                >
                  {t('cancel')}
                </button>
              )}
              {!row.cancelled && admin && !row.payments.some((payment) => payment.kind === 'refund') && (
                <form
                  className="space-y-4"
                  aria-label={t('transferForm')}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void submit({
                      guaranteeId: row.id,
                      kind: row.payments.length ? 'refund' : 'receipt',
                      amountVnd: Number(data.get('amountVnd')),
                      externalReference: data.get('externalReference'),
                      reason: data.get('reason'),
                      moneyVerified: data.get('moneyVerified') === 'on',
                      bankVerified: data.get('bankVerified') === 'on',
                    });
                  }}
                >
                  <p className="font-semibold">{row.payments.length ? t('confirmRefund') : t('confirmReceipt')}</p>
                  {row.payments.length > 0 && <p className="mu-note">{t('unusedRefundOnly')}</p>}
                  <label className="mu-field">
                    {t('amount')}
                    <input name="amountVnd" type="number" min="1" step="1" required defaultValue={row.requiredVnd} />
                  </label>
                  <label className="mu-field">
                    {t('reference')}
                    <input name="externalReference" required minLength={8} maxLength={128} autoComplete="off" />
                  </label>
                  <label className="mu-field">
                    {t('reason')}
                    <textarea name="reason" required maxLength={1000} />
                  </label>
                  <label className="flex gap-3">
                    <input name="moneyVerified" type="checkbox" required />
                    {t('moneyVerified')}
                  </label>
                  {row.payments.length > 0 && (
                    <label className="flex gap-3">
                      <input name="bankVerified" type="checkbox" required />
                      {t('bankVerified')}
                    </label>
                  )}
                  <button
                    className="mu-button"
                    disabled={busy || (row.payments.length > 0 && listing.listingStatus !== 'hidden')}
                  >
                    {common('submit')}
                  </button>
                </form>
              )}
              {row.payments.map((payment) => (
                <div key={payment.id} className="mu-note border-l border-store-muted/30 pl-3">
                  <strong>
                    {t(payment.kind)} · {money(payment.amountVnd)}
                  </strong>
                  <p>{new Date(payment.createdAt).toLocaleString(locale)}</p>
                  <p className="break-all">{payment.externalReference}</p>
                  <p>{payment.reason}</p>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </article>
  );
}
