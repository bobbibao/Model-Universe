'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Modal from '@/components/Modal/Modal';
import PromoIcon from '@/components/PromoIcon';
import { formatVND } from '@/shared/server/utils/utils';
import type { CouponPreview } from '@/shared/types/order';

export interface VoucherOption {
  code: string;
  title: string;
  benefitType: 'discount' | 'freeship';
  discountPercent: number;
  maxDiscountVnd: number | null;
  maxShippingVnd: number | null;
  minOrderVnd: number;
  expiresAt: string;
  discountVnd: number;
  eligible: boolean;
  reason: string | null;
}
export interface MonthlyOffer {
  available: boolean;
  code: string | null;
  discountPercent: number;
}
type Kind = 'discount' | 'freeship';

const short = (vnd: number) => (vnd >= 1_000_000 ? `${vnd / 1_000_000}TR` : `${Math.round(vnd / 1000)}K`);

// The voucher picker: type a code, or pick one per tab (shop vouchers, shipping vouchers). Usable vouchers come first
// with what each saves on this cart and the best one marked; unusable ones follow, greyed, with the reason. The choice
// is staged and only applied with "Đồng ý", so browsing never changes the cart.
export default function VoucherPicker({
  open,
  initialTab,
  options,
  best,
  monthly,
  selected,
  onClose,
  onConfirm,
  onLookup,
  onClaimMonthly,
}: {
  open: boolean;
  initialTab: Kind;
  options: VoucherOption[];
  best: Record<Kind, string | null>;
  monthly: MonthlyOffer | null;
  selected: Record<Kind, string | null>;
  onClose: () => void;
  onConfirm: (choice: Record<Kind, string | null>) => Promise<void>;
  onLookup: (code: string) => Promise<CouponPreview | null>;
  onClaimMonthly: () => Promise<void>;
}) {
  const t = useTranslations('voucherPicker'),
    locale = useLocale();
  const money = (value: number) => formatVND(value, locale);
  const [tab, setTab] = useState<Kind>(initialTab);
  const [choice, setChoice] = useState(selected);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setChoice(selected);
    setCode('');
    // Reset only when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const list = options
    .filter((option) => option.benefitType === tab)
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.discountVnd - a.discountVnd);
  const saving = (['discount', 'freeship'] as Kind[]).reduce(
    (sum, kind) => sum + (options.find((option) => option.code === choice[kind])?.discountVnd ?? 0),
    0,
  );
  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    const value = await onLookup(code.trim().toUpperCase());
    setBusy(false);
    if (value) {
      const kind: Kind = value.benefitType === 'freeship' ? 'freeship' : 'discount';
      setTab(kind);
      setChoice((current) => ({ ...current, [kind]: value.code }));
      setCode('');
    }
  };

  return (
    <Modal
      open={open}
      variant="sheet"
      title={t('title')}
      onClose={onClose}
      footer={
        <div className="picker-footer">
          <span>
            {saving > 0 ? (
              <>
                {t('youSave')} <strong>{money(saving)}</strong>
              </>
            ) : (
              t('noneSelected')
            )}
          </span>
          <button
            type="button"
            className="picker-confirm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(choice);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('confirm')}
          </button>
        </div>
      }
    >
      <form className="picker-code" onSubmit={(event) => void lookup(event)}>
        <PromoIcon name="ticket" size={18} />
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t('codePlaceholder')}
          aria-label={t('codePlaceholder')}
        />
        <button type="submit" disabled={busy || !code.trim()}>
          {t('apply')}
        </button>
      </form>

      {monthly?.available && (
        <div className="picker-monthly">
          <span className="picker-monthly-icon">
            <PromoIcon name="crown" size={18} />
          </span>
          <span>
            <strong>{t('monthlyTitle', { percent: monthly.discountPercent })}</strong>
            <small>{t('monthlyText')}</small>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onClaimMonthly();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('claim')}
          </button>
        </div>
      )}

      <div className="picker-tabs" role="tablist">
        {(['discount', 'freeship'] as Kind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            className={tab === kind ? 'is-active' : ''}
            onClick={() => setTab(kind)}
          >
            {t(kind === 'discount' ? 'shopVoucher' : 'shipVoucher')}
            <span>{options.filter((option) => option.benefitType === kind && option.eligible).length}</span>
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="picker-empty">{t('empty')}</p>}
      <ul className="picker-list">
        {list.map((option, index) => {
          const active = choice[tab] === option.code;
          const firstUnusable = !option.eligible && (index === 0 || list[index - 1].eligible);
          const value =
            option.benefitType === 'freeship' ? short(option.maxShippingVnd ?? 0) : `${option.discountPercent}%`;
          return (
            <li key={option.code}>
              {firstUnusable && <p className="picker-divider">{t('unusable')}</p>}
              <button
                type="button"
                disabled={!option.eligible}
                aria-pressed={active}
                className={`pick-ticket is-${option.benefitType}${active ? ' is-active' : ''}${option.eligible ? '' : ' is-off'}`}
                onClick={() => setChoice((current) => ({ ...current, [tab]: active ? null : option.code }))}
              >
                <span className="pick-stub">
                  <PromoIcon name={option.benefitType === 'freeship' ? 'truck' : 'percent'} size={16} />
                  <strong>{value}</strong>
                </span>
                <span className="pick-body">
                  <span className="pick-title">
                    {option.title}
                    {best[tab] === option.code && option.eligible && <em>{t('best')}</em>}
                  </span>
                  <small>
                    {option.minOrderVnd > 0 ? t('minOrder', { amount: money(option.minOrderVnd) }) : t('noMinimum')}
                    {option.benefitType === 'discount' && option.maxDiscountVnd
                      ? ` · ${t('cap', { amount: money(option.maxDiscountVnd) })}`
                      : ''}
                  </small>
                  {option.eligible ? (
                    <b>{t('saves', { amount: money(option.discountVnd) })}</b>
                  ) : (
                    <i>{option.reason}</i>
                  )}
                  <small className="pick-expiry">
                    {option.code} ·{' '}
                    {t('expires', {
                      date: new Date(option.expiresAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                      }),
                    })}
                  </small>
                </span>
                <span className="pick-radio" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
