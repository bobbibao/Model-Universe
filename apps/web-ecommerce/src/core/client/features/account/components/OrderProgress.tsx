'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Order } from '@/shared/types/order';

type Step = { key: string; at: string | null };

const firstEvent = (order: Order, statuses: string[]) => {
  const events = (order.shipments || [])
    .flatMap((shipment) => shipment.events || [])
    .filter((event) => event.applied && statuses.includes(event.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return events[0]?.createdAt ?? null;
};

// The order's journey as a stepper with the time of each step (placed → paid → handed to the carrier → out for
// delivery → delivered; or the in-person handover). A cancelled order ends with its cancellation.
export default function OrderProgress({ order }: { order: Order }) {
  const t = useTranslations('purchases.progress'),
    locale = useLocale();
  const paidAt = order.prepayments?.find((row) => row.kind === 'receipt')?.createdAt ?? null;
  const steps: Step[] =
    order.fulfillmentMethod === 'DIRECT_MEETING'
      ? [
          { key: 'placed', at: order.createdAt },
          { key: 'paid', at: paidAt },
          { key: 'appointment', at: order.meeting?.history.find((entry) => entry.action === 'confirmed')?.at ?? null },
          { key: 'handedOver', at: order.meeting?.handoverAt ?? null },
        ]
      : [
          { key: 'placed', at: order.createdAt },
          { key: 'paid', at: paidAt },
          { key: 'handedToCarrier', at: firstEvent(order, ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']) },
          { key: 'outForDelivery', at: firstEvent(order, ['OUT_FOR_DELIVERY', 'DELIVERED']) },
          { key: 'delivered', at: firstEvent(order, ['DELIVERED']) ?? order.deliveredAt ?? null },
        ];
  const cancelled = order.status === 'CANCELLED';
  const shown = cancelled
    ? [...steps.filter((step) => step.at), { key: 'cancelled', at: order.cancelledAt ?? order.updatedAt }]
    : steps;
  const reached = shown.filter((step) => step.at).length;
  const time = (iso: string) =>
    new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return (
    <ol className={`order-progress${cancelled ? ' is-cancelled' : ''}`} aria-label={t('label')}>
      {shown.map((step, index) => (
        <li
          key={step.key}
          className={step.at ? (index === reached - 1 ? 'is-current' : 'is-done') : ''}
          aria-current={step.at && index === reached - 1 ? 'step' : undefined}
        >
          <span className="order-progress-dot" aria-hidden="true">
            {step.at ? (step.key === 'cancelled' ? '×' : '✓') : index + 1}
          </span>
          <strong>{t(step.key)}</strong>
          {step.at && <small>{time(step.at)}</small>}
        </li>
      ))}
    </ol>
  );
}
