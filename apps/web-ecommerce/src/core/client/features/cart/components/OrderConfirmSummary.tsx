'use client';

import { useLocale, useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import ProductImage from '@/components/ProductImage';
import { formatVND } from '@/shared/server/utils/utils';

interface Item {
  key: string;
  name: string;
  imageUrl?: string | null;
  quantity: number;
}

// The order at a glance before paying: what, where and how it arrives, and what is paid now and later. Sections a
// customer scans top to bottom, with the amount to transfer now as the one large number.
export default function OrderConfirmSummary({
  items,
  count,
  courier,
  recipient,
  address,
  carrierName,
  parcels,
  visit,
  shippingFeeVnd,
  totalVnd,
  upfrontVnd,
  balanceVnd,
  onlinePayment,
  benefits,
}: {
  items: Item[];
  count: number;
  courier: boolean;
  recipient: string;
  address: string;
  carrierName?: string | null;
  parcels?: number;
  visit?: string;
  shippingFeeVnd: number;
  totalVnd: number;
  upfrontVnd: number;
  balanceVnd: number;
  onlinePayment: boolean;
  // The goods at list price and each benefit on its own line (v6.2 BRD §10: no hidden second voucher), and the points
  // the order earns.
  benefits?: {
    listVnd: number;
    voucherCode: string | null;
    voucherVnd: number;
    rankTier: string | null;
    rankVnd: number;
    shippingDiscountVnd: number;
    earnedPoints: number;
  };
}) {
  const t = useTranslations('checkout.confirmSummary'),
    tierNames = useTranslations('tiers'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const shown = items.slice(0, 4);
  return (
    <div className="order-confirm">
      <section className="order-confirm-items">
        <div className="order-confirm-thumbs">
          {shown.map((item) => (
            <span key={item.key} title={`${item.quantity} × ${item.name}`}>
              <ProductImage src={item.imageUrl} alt={item.name} sizes="48px" className="object-contain" />
              {item.quantity > 1 && <b>×{item.quantity}</b>}
            </span>
          ))}
          {items.length > shown.length && <span className="is-more">+{items.length - shown.length}</span>}
        </div>
        <strong>{t('items', { count })}</strong>
      </section>

      <section className="order-confirm-row">
        <AdminIcon name={courier ? 'truck' : 'pin'} size={18} />
        <div>
          <small>{t(courier ? 'deliverTo' : 'collectAt')}</small>
          <strong>{recipient}</strong>
          <span>{address}</span>
          {visit && <span className="order-confirm-visit">{visit}</span>}
        </div>
      </section>

      <section className="order-confirm-row">
        <AdminIcon name="box" size={18} />
        <div className="order-confirm-line">
          <span>
            {courier ? carrierName || t('shipping') : t('noShipping')}
            {courier && (parcels ?? 1) > 1 && <small> · {t('parcels', { count: parcels! })}</small>}
          </span>
          <b>{shippingFeeVnd > 0 ? money(shippingFeeVnd) : t('free')}</b>
        </div>
      </section>

      <dl className="order-confirm-money">
        {benefits && benefits.voucherVnd + benefits.rankVnd + benefits.shippingDiscountVnd > 0 && (
          <>
            <div className="is-detail">
              <dt>{t('goods')}</dt>
              <dd>{money(benefits.listVnd)}</dd>
            </div>
            {benefits.voucherVnd > 0 && (
              <div className="is-detail is-saving">
                <dt>{t('voucher', { code: benefits.voucherCode ?? '' })}</dt>
                <dd>-{money(benefits.voucherVnd)}</dd>
              </div>
            )}
            {benefits.rankVnd > 0 && benefits.rankTier && (
              <div className="is-detail is-saving">
                <dt>{t('rank', { tier: tierNames(benefits.rankTier) })}</dt>
                <dd>-{money(benefits.rankVnd)}</dd>
              </div>
            )}
            {benefits.shippingDiscountVnd > 0 && (
              <div className="is-detail is-saving">
                <dt>{t('shipDiscount')}</dt>
                <dd>-{money(benefits.shippingDiscountVnd)}</dd>
              </div>
            )}
          </>
        )}
        <div>
          <dt>{t('total')}</dt>
          <dd>{money(totalVnd)}</dd>
        </div>
        <div className="is-now">
          <dt>{t(onlinePayment ? 'payNowQr' : 'payNow')}</dt>
          <dd>{money(upfrontVnd)}</dd>
        </div>
        <div>
          <dt>{t(courier ? 'later' : 'laterAtShop')}</dt>
          <dd>{balanceVnd > 0 ? money(balanceVnd) : t('nothing')}</dd>
        </div>
      </dl>
      {benefits && benefits.earnedPoints > 0 && (
        <p className="order-confirm-points">{t('points', { points: benefits.earnedPoints })}</p>
      )}
      <p className="order-confirm-note">{t(onlinePayment ? 'noteQr' : 'note')}</p>
    </div>
  );
}
