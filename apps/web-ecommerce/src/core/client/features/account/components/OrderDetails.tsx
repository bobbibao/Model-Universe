'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import ProductImage from '@/components/ProductImage';
import { formatVND } from '@/shared/server/utils/utils';
import type { Order } from '@/shared/types/order';

const Row = ({label,value,strong}:{label:string;value:string;strong?:boolean}) => <div className={`flex justify-between gap-4 py-2 ${strong ? 'border-t border-stroke text-lg font-bold' : ''}`}><span className="mu-note !mt-0">{label}</span><span className={strong ? 'text-brand-hover' : ''}>{value}</span></div>;
export const formatOrderAddress = (order:Order) => [order.address,order.ward,order.district,order.city].filter(Boolean).join(', ');

// Retained line snapshots stay authoritative even when the live listing changes.
export default function OrderDetails({order}:{order:Order}) {
  const t = useTranslations('checkout'), catalog = useTranslations('catalog'), locale = useLocale();
  const money = (amount:number) => formatVND(amount,locale);
  return <div className="space-y-6">
    <ul className="divide-y divide-slate-200">{(order.items || []).map(item => <li key={item.id} className="flex flex-wrap gap-4 py-4">
      <div className="relative h-20 w-20 shrink-0"><ProductImage src={item.imageUrl} alt={item.productName} sizes="80px" className="object-contain" /></div>
      <div className="min-w-0 flex-1"><Link href={`/shop/product/${item.productId}`} className="font-semibold">{item.productName}</Link><p className="mu-note">{typeof item.modelSnapshot?.grade === 'string' ? item.modelSnapshot.grade : ''} {typeof item.modelSnapshot?.scale === 'string' ? item.modelSnapshot.scale : ''} {item.modelSnapshot?.condition ? catalog(item.modelSnapshot.condition === 'preowned' ? 'preowned' : 'new') : ''}</p>{item.size && <p className="mu-note">{t('size')}: {item.size}</p>}<p className="mu-note">{item.quantity} × {money(item.unitPrice)}</p></div>
      <p className="font-bold">{money(item.quantity * item.unitPrice)}</p>
    </li>)}</ul>
    <div className="grid gap-6 md:grid-cols-2">
      <div><h3 className="font-semibold">{t('shippingTitle')}</h3><p className="mu-note">{order.recipientName}<br />{order.phone}<br />{formatOrderAddress(order)}</p>{order.note && <p className="mu-note">{t('note')}: {order.note}</p>}<p className="mu-note">{t(order.paymentSource === 'BANK_TRANSFER' ? 'bankTransfer' : order.paymentSource === 'TRANSFER_PLUS_COD' ? 'mixedPayment' : 'cod')} · {t(`paymentStatus.${order.paymentStatus}`)}</p></div>
      <div><Row label={t('subtotal')} value={money(order.subtotal)} /><Row label={t('shippingFee')} value={order.shippingFee > 0 ? money(order.shippingFee) : t('free')} /><Row label={t('discount')} value={order.discount > 0 ? `-${money(order.discount)}${order.couponCode ? ` (${order.couponCode})` : ''}` : t('noDiscount')} /><Row label={t('total')} value={money(order.total)} strong />{(order.prepaidVnd || 0) > 0 && <><Row label={t('prepaid')} value={money(order.prepaidVnd || 0)} /><Row label={t('codBalance')} value={money(order.paymentStatus === 'PAID' ? 0 : Math.max(0,order.total - (order.prepaidVnd || 0)))} /></>}</div>
    </div>
  </div>;
}
