'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import CouponApi from '@/core/client/api/Coupon';
import PromoIcon from '@/components/PromoIcon';
import { formatVND } from '@/shared/server/utils/utils';
import type { CouponPreview } from '@/shared/types/order';
import type { CartQuote } from '@/shared/types/cart';
import VoucherPicker, { type VoucherOption, type MonthlyOffer } from './VoucherPicker';

interface Props {
  loggedIn: boolean;
  items: { productId: number; size: string; quantity: number }[];
  subtotal: number;
  shippingFeeVnd: number;
  coupon: CouponPreview | null;
  freeship: CouponPreview | null;
  onCoupon: (coupon: CouponPreview | null) => void;
  onFreeship: (coupon: CouponPreview | null) => void;
  usePoints: boolean;
  onPoints: (on: boolean) => void;
  quote?: CartQuote;
}

// The cart's offers, the way TikTok Shop lays them out: one row per slot (shop voucher, shipping voucher, points),
// each showing what it saves and opening a picker. The best voucher of each kind is applied automatically; once the
// customer chooses for themselves, their choice stays. Every code is still re-checked by the cart quote and at
// checkout, and an automatic pick that the combined profit check refuses is dropped instead of shown as an error.
export default function VoucherSection({
  loggedIn,
  items,
  subtotal,
  shippingFeeVnd,
  coupon,
  freeship,
  onCoupon,
  onFreeship,
  usePoints,
  onPoints,
  quote,
}: Props) {
  const t = useTranslations('voucherPicker'),
    locale = useLocale();
  const money = (value: number) => formatVND(value, locale);
  const [options, setOptions] = useState<VoucherOption[]>([]);
  const [best, setBest] = useState<{ discount: string | null; freeship: string | null }>({
    discount: null,
    freeship: null,
  });
  const [monthly, setMonthly] = useState<MonthlyOffer | null>(null);
  const [open, setOpen] = useState<'discount' | 'freeship' | null>(null);
  // Automatic mode per slot until the customer picks; codes the combined check refused are not picked again.
  const auto = useRef({ discount: true, freeship: true });
  const refused = useRef(new Set<string>());
  const signature = JSON.stringify({ items, shippingFeeVnd });

  const load = useCallback(async () => {
    if (!loggedIn || !items.length) return;
    try {
      const request = JSON.parse(signature) as { items: Props['items']; shippingFeeVnd: number };
      const [evaluation, wallet] = await Promise.all([Api.post('/vouchers/evaluate', request), Api.get('/vouchers')]);
      setOptions(evaluation.data.options);
      setBest({ discount: evaluation.data.best?.code ?? null, freeship: evaluation.data.bestFreeship?.code ?? null });
      setMonthly(wallet.data.monthly ?? null);
    } catch {
      /* Optional help: the cart quote and checkout validate any code again. */
    }
  }, [loggedIn, signature, items.length]);
  useEffect(() => {
    void load();
  }, [load]);

  const preview = useCallback((code: string) => CouponApi.validateCoupon(code, subtotal), [subtotal]);

  // Apply the best code of each kind while the slot is automatic.
  useEffect(() => {
    // Wait for the priced cart: a code checked against a zero subtotal would be refused.
    if (!loggedIn || subtotal <= 0) return;
    const sync = async (kind: 'discount' | 'freeship', current: CouponPreview | null, set: Props['onCoupon']) => {
      if (!auto.current[kind]) return;
      const eligible = options
        // Evaluations can lag behind a cart that just shrank: never pick a code whose minimum is no longer met.
        .filter(
          (option) =>
            option.benefitType === kind &&
            option.eligible &&
            option.minOrderVnd <= subtotal &&
            !refused.current.has(option.code),
        )
        .sort((a, b) => b.discountVnd - a.discountVnd);
      const code = eligible[0]?.code ?? null;
      if (code === (current?.code ?? null)) return;
      if (!code) return set(null);
      const value = await preview(code);
      if (value && auto.current[kind]) set(value);
    };
    void sync('discount', coupon, onCoupon);
    void sync('freeship', freeship, onFreeship);
    // `best` changes with every evaluation; the options carry the same information.
  }, [options, best, loggedIn, subtotal, coupon, freeship, onCoupon, onFreeship, preview]);

  // An automatic pick the combined profit check refuses (e.g. freeship on top of a big voucher) is dropped quietly.
  useEffect(() => {
    if (!quote) return;
    if (auto.current.freeship && freeship && quote.freeshipRefusal) {
      refused.current.add(freeship.code);
      onFreeship(null);
    }
    if (auto.current.discount && coupon && quote.voucherRefusal) {
      refused.current.add(coupon.code);
      onCoupon(null);
    }
  }, [quote, coupon, freeship, onCoupon, onFreeship]);

  if (!loggedIn)
    return (
      <section className="voucher-section">
        <Link href="/auth/signin?redirect=/cart" className="voucher-row is-guest">
          <span className="voucher-row-icon">
            <PromoIcon name="ticket" size={18} />
          </span>
          <span className="voucher-row-label">{t('signIn')}</span>
          <PromoIcon name="arrow" size={16} />
        </Link>
      </section>
    );

  const count = (kind: 'discount' | 'freeship') =>
    options.filter((option) => option.benefitType === kind && option.eligible).length;
  const voucherSaving = quote?.voucherDiscountVnd ?? 0,
    shipSaving = quote?.shippingDiscountVnd ?? 0,
    pointsSaving = quote?.pointsDiscountVnd ?? 0;
  const total = voucherSaving + shipSaving + pointsSaving;
  const autoApplied = (auto.current.discount && !!coupon) || (auto.current.freeship && !!freeship);
  const row = (kind: 'discount' | 'freeship') => {
    const value = kind === 'discount' ? coupon : freeship;
    const saving = kind === 'discount' ? voucherSaving : shipSaving;
    return (
      <button type="button" className={`voucher-row is-${kind}`} onClick={() => setOpen(kind)}>
        <span className="voucher-row-icon">
          <PromoIcon name={kind === 'discount' ? 'ticket' : 'truck'} size={18} />
        </span>
        <span className="voucher-row-label">
          {t(kind === 'discount' ? 'shopVoucher' : 'shipVoucher')}
          {!value && count(kind) > 0 && <em>{t('available', { count: count(kind) })}</em>}
        </span>
        {value ? (
          <span className="voucher-row-value">{saving > 0 ? `-${money(saving)}` : value.code}</span>
        ) : (
          <span className="voucher-row-empty">
            {kind === 'freeship' && !shippingFeeVnd ? t('needAddress') : t('choose')}
          </span>
        )}
        <svg viewBox="0 0 24 24" className="voucher-row-chevron" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    );
  };

  return (
    <section className="voucher-section" aria-label={t('title')}>
      {row('discount')}
      {row('freeship')}
      <label className={`voucher-row is-points${usePoints ? ' is-on' : ''}`}>
        <span className="voucher-row-icon">
          <PromoIcon name="coin" size={18} />
        </span>
        <span className="voucher-row-label">
          {t('points')}
          <small>
            {usePoints && quote
              ? (quote.pointsUsed ?? 0) > 0
                ? t('pointsUsed', { points: quote.pointsUsed ?? 0 })
                : t('pointsNone')
              : t('pointsHint')}
          </small>
        </span>
        {usePoints && pointsSaving > 0 && <span className="voucher-row-value">-{money(pointsSaving)}</span>}
        <input
          type="checkbox"
          role="switch"
          className="voucher-switch"
          checked={usePoints}
          onChange={(event) => onPoints(event.target.checked)}
        />
      </label>
      {total > 0 && (
        <p className="voucher-total">
          <PromoIcon name="check" size={15} />
          {autoApplied ? t('bestApplied', { amount: money(total) }) : t('saving', { amount: money(total) })}
        </p>
      )}
      <VoucherPicker
        open={open !== null}
        initialTab={open ?? 'discount'}
        options={options}
        best={best}
        monthly={monthly}
        selected={{ discount: coupon?.code ?? null, freeship: freeship?.code ?? null }}
        onClose={() => setOpen(null)}
        onClaimMonthly={async () => {
          await Api.post('/vouchers/monthly');
          await load();
        }}
        onLookup={async (code) => {
          const value = await preview(code);
          if (value) await load();
          return value ?? null;
        }}
        onConfirm={async (choice) => {
          auto.current = { discount: false, freeship: false };
          const [discount, ship] = await Promise.all([
            choice.discount ? preview(choice.discount) : Promise.resolve(null),
            choice.freeship ? preview(choice.freeship) : Promise.resolve(null),
          ]);
          onCoupon(discount ?? null);
          onFreeship(ship ?? null);
          setOpen(null);
        }}
      />
      <Link href="/uu-dai" className="voucher-hunt">
        <PromoIcon name="gift" size={15} />
        {t('hunt')}
        <PromoIcon name="arrow" size={14} />
      </Link>
    </section>
  );
}
