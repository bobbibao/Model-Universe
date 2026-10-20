'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import CouponApi from '@/core/client/api/Coupon';
import ProductImage from '@/components/ProductImage';
import { formatVND } from '@/shared/server/utils/utils';
import { useCart } from '@/shared/client/providers/CartProvider';
import type { CouponPreview } from '@/shared/types/order';

interface WalletVoucher {
  code: string;
  title: string;
  discountPercent: number;
  maxDiscountVnd: number | null;
  minOrderVnd: number;
  expirationDate: string;
  kind: string;
  benefitType?: 'discount' | 'freeship';
  maxShippingVnd?: number | null;
}
interface Wallet {
  vouchers: WalletVoucher[];
  monthly: { available: boolean; code: string | null; discountPercent: number; minOrderVnd: number; maxDiscountVnd: number | null; expiresAt: string } | null;
}
interface Option { code: string; discountVnd: number; eligible: boolean; reason: string | null }
interface Suggestion {
  product: { id: number; name: string; imageUrl: string; priceVnd: number };
  currentVoucher: { code: string; discountVnd: number } | null;
  unlockedVoucher: { code: string; title: string; discountPercent: number; maxDiscountVnd: number | null; discountVnd: number };
  currentCartPayableVnd: number;
  newCartPayableVnd: number;
  additionalPaymentVnd: number;
  extraDiscountVnd: number;
}

// The customer's vouchers with what each one saves on this cart, the monthly member code, the best voucher, and
// products that would unlock a better voucher (docs/business/pricing-voucher-specification.md, chapters VIII–X).
// One money-off code per order: choosing a voucher replaces the current one.
export default function VoucherWallet({
  subtotal,
  shippingFeeVnd = 0,
  onApply,
}: {
  subtotal: number;
  shippingFeeVnd?: number;
  onApply: (coupon: CouponPreview) => void;
}) {
  const t = useTranslations('vouchers'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const { entries, addItem } = useCart();
  const [wallet, setWallet] = useState<Wallet>();
  const [options, setOptions] = useState<Option[]>([]);
  const [best, setBest] = useState<Option | null>(null);
  const [bestFreeship, setBestFreeship] = useState<Option | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const items = JSON.stringify(entries.map(({ item }) => ({ productId: item.productId, size: item.size, quantity: item.quantity })));

  const load = useCallback(async () => {
    try {
      const [walletResponse, evaluation, addOns] = await Promise.all([
        Api.get('/vouchers'),
        Api.post('/vouchers/evaluate', { items: JSON.parse(items), shippingFeeVnd }),
        Api.post('/vouchers/add-ons', { items: JSON.parse(items) }),
      ]);
      setWallet(walletResponse.data);
      setOptions(evaluation.data.options);
      setBest(evaluation.data.best);
      setBestFreeship(evaluation.data.bestFreeship ?? null);
      setSuggestions(addOns.data.suggestions);
    } catch {
      /* The wallet is optional help; checkout validates any code again. */
    }
  }, [items, shippingFeeVnd]);
  useEffect(() => {
    void load();
  }, [load]);

  const use = async (code: string) => {
    setBusy(true);
    const preview = await CouponApi.validateCoupon(code, subtotal);
    setBusy(false);
    if (preview) onApply(preview);
  };
  const claim = async () => {
    setBusy(true);
    try {
      await Api.post('/vouchers/monthly');
      await load();
    } catch {
      /* The toast explains why. */
    } finally {
      setBusy(false);
    }
  };
  if (!wallet) return null;
  const optionOf = (code: string) => options.find((option) => option.code === code);
  return (
    <div className="mt-4 space-y-4 text-sm">
      <h3 className="font-bold">{t('wallet')}</h3>
      {wallet.monthly && (
        <div className="rounded-md border border-dashed border-brand-hover p-3">
          <p className="font-semibold">{t('monthlyTitle', { percent: wallet.monthly.discountPercent })}</p>
          <p className="mu-note">
            {t('monthlyTerms', { minimum: money(wallet.monthly.minOrderVnd), expires: new Date(wallet.monthly.expiresAt).toLocaleDateString(locale) })}
          </p>
          {wallet.monthly.available ? (
            <button className="mu-button mt-2" disabled={busy} onClick={() => void claim()}>
              {t('monthlyClaim')}
            </button>
          ) : (
            <p className="mu-note">{t('monthlyClaimed', { code: wallet.monthly.code || '' })}</p>
          )}
        </div>
      )}
      {best && (
        <button className="mu-button w-full" disabled={busy} onClick={() => void use(best.code)}>
          {t('best', { code: best.code, amount: money(best.discountVnd) })}
        </button>
      )}
      {bestFreeship && (
        <button className="mu-button-secondary w-full" disabled={busy} onClick={() => void use(bestFreeship.code)}>
          {t('bestFreeship', { code: bestFreeship.code, amount: money(bestFreeship.discountVnd) })}
        </button>
      )}
      {!wallet.vouchers.length && <p className="mu-note">{t('noVouchers')}</p>}
      <ul className="space-y-2">
        {wallet.vouchers.map((voucher) => {
          const option = optionOf(voucher.code);
          return (
            <li key={voucher.code} className="rounded-md border border-stroke p-3 dark:border-store-card">
              <p className="font-semibold">
                {voucher.code} · {voucher.title}
              </p>
              <p className="mu-note">
                {voucher.benefitType === 'freeship'
                  ? t('freeshipCap', { amount: money(voucher.maxShippingVnd ?? 0) })
                  : voucher.maxDiscountVnd
                    ? t('cap', { percent: voucher.discountPercent, cap: money(voucher.maxDiscountVnd) })
                    : t('percent', { percent: voucher.discountPercent })}{' '}
                · {t('minOrder', { amount: money(voucher.minOrderVnd) })} ·{' '}
                {t('expires', { date: new Date(voucher.expirationDate).toLocaleDateString(locale) })}
              </p>
              {option?.eligible ? (
                <button className="mt-1 underline" disabled={busy} onClick={() => void use(voucher.code)}>
                  {t('use', { amount: money(option.discountVnd) })}
                </button>
              ) : (
                option?.reason && <p className="mu-note">{option.reason}</p>
              )}
            </li>
          );
        })}
      </ul>
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold">{t('addOnsTitle')}</h3>
          <p className="mu-note">{t('addOnsNote')}</p>
          {suggestions.map((suggestion) => (
            <div key={suggestion.product.id} className="flex gap-3 rounded-md border border-stroke p-3 dark:border-store-card">
              <div className="relative h-16 w-16 shrink-0">
                <ProductImage src={suggestion.product.imageUrl} alt={suggestion.product.name} sizes="64px" className="object-contain" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">{suggestion.product.name}</p>
                <p className="mu-note">{t('suggestedPrice', { amount: money(suggestion.product.priceVnd) })}</p>
                <p className="mu-note">
                  {t('unlock', { code: suggestion.unlockedVoucher.code, amount: money(suggestion.unlockedVoucher.discountVnd) })}
                </p>
                <p className="mu-note">
                  {t('payables', { now: money(suggestion.currentCartPayableVnd), next: money(suggestion.newCartPayableVnd) })}
                </p>
                <p className="mu-note">
                  {t('extraSpend', { amount: money(suggestion.additionalPaymentVnd), saving: money(suggestion.extraDiscountVnd) })}
                </p>
                <div className="flex gap-3">
                  <button
                    className="underline"
                    onClick={() =>
                      addItem(
                        { id: suggestion.product.id, name: suggestion.product.name, imageUrl: suggestion.product.imageUrl, price: suggestion.product.priceVnd, brandName: '', stock: 1 },
                        '',
                        1,
                      )
                    }
                  >
                    {t('add')}
                  </button>
                  <Link className="underline" href={`/shop/product/${suggestion.product.id}`}>
                    {t('viewProduct')}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
