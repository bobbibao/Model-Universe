'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import { SUPERAI_CARRIERS } from '@/shared/packing/rules';
import type { PackagePlanSnapshot } from '@/shared/packing/plan';
import type { Order } from '@/shared/types/order';

interface PlanVersion {
  id: number;
  version: number;
  status: 'PROPOSED' | 'CONFIRMED' | 'SUPERSEDED';
  plan: PackagePlanSnapshot | null;
  alternatives: PackagePlanSnapshot[];
  estimatedProductIds: number[];
  chargedFeeVnd: number;
  note: string | null;
}
export interface PackagePlanView {
  current: PlanVersion | null;
  history: {
    id: number;
    version: number;
    status: string;
    totalFeeVnd: number | null;
    parcels: number;
    createdAt: string;
    note: string | null;
  }[];
  missingParcels: number[];
  chargedFeeVnd: number;
}

const kg = (gram: number) => `${(gram / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`;

// A top view of a parcel: where each kit box lies in the carton (from the plan's placements), for whoever packs it.
function TopView({ parcel }: { parcel: PackagePlanSnapshot['parcels'][number] }) {
  const width = Math.max(...parcel.placements.map((p) => p.x + p.lengthCm), 1);
  const depth = Math.max(...parcel.placements.map((p) => p.y + p.widthCm), 1);
  const layers = [...new Set(parcel.placements.map((p) => p.z))].sort((a, b) => a - b);
  return (
    <svg className="parcel-topview" viewBox={`0 0 ${width} ${depth}`} role="img" aria-label="top view">
      {parcel.placements.map((p) => (
        <rect
          key={p.key}
          x={p.x}
          y={p.y}
          width={p.lengthCm}
          height={p.widthCm}
          style={{ opacity: 0.35 + (0.65 * (layers.indexOf(p.z) + 1)) / layers.length }}
        />
      ))}
    </svg>
  );
}

// The order's package plan for staff (src/shared/packing): every parcel with its carton, contents, weights, fee and the
// COD it collects, what the plan costs against the fee the customer paid, the alternatives the optimizer weighed, and
// one action to book the waybills of every parcel still without one.
export default function PackagePlanCard({
  order,
  deposited,
  onOrder,
}: {
  order: Order;
  deposited: boolean;
  onOrder: (order: Order) => void;
}) {
  const t = useTranslations('packagePlan'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [view, setView] = useState<PackagePlanView>();
  const [busy, setBusy] = useState(false);
  const requestKey = useRef('');
  const load = useCallback(
    () =>
      void Api.get(`/admin/orders/${order.id}/package-plan`)
        .then((response) => setView(response.data))
        .catch(() => undefined),
    [order.id],
  );
  useEffect(load, [load, order.shipments?.length]);
  const plan = view?.current?.plan;
  if (!view || !plan) return null;

  const replan = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      setView(
        (await Api.post(`/admin/orders/${order.id}/package-plan`, { ...body, expectedVersion: view.current!.version }))
          .data,
      );
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };
  const createWaybills = async () => {
    setBusy(true);
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      onOrder(
        (await Api.post(`/admin/orders/${order.id}/shipments`, { requestKey: requestKey.current, allParcels: true }))
          .data,
      );
      requestKey.current = '';
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
      load();
    }
  };
  const count = plan.parcels.length;
  const difference = plan.carrierFeeVnd - view.chargedFeeVnd;
  const carrier = plan.carrierId ? (SUPERAI_CARRIERS[String(plan.carrierId)] ?? `#${plan.carrierId}`) : t('estimate');
  const editable = order.status === 'PROCESSING' && view.missingParcels.length === count;

  return (
    <section className="package-plan space-y-3">
      <header className="package-plan-head">
        <div>
          <h3 className="font-semibold">{t('title', { count })}</h3>
          <p className="mu-note text-sm">
            {t('summary', { carrier, fee: money(plan.carrierFeeVnd), version: view.current!.version })}
            {difference !== 0 && (
              <span className={difference > 0 ? 'package-plan-over' : 'package-plan-under'}>
                {' '}
                · {t(difference > 0 ? 'overCharged' : 'underCharged', { amount: money(Math.abs(difference)) })}
              </span>
            )}
          </p>
        </div>
        {!plan.carrierRuleVerified && <span className="packing-unverified">{t('unverifiedLimits')}</span>}
      </header>
      {view.current!.estimatedProductIds.length > 0 && (
        <p className="prepayment-warning text-sm">{t('estimatedSizes')}</p>
      )}

      <ol className="package-plan-parcels">
        {plan.parcels.map((parcel) => {
          const waybill = order.shipments?.find(
            (row) => (row.parcelIndex ?? 1) === parcel.index && !['CANCELLED', 'RETURNED'].includes(row.status),
          );
          return (
            <li key={parcel.index}>
              <TopView parcel={parcel} />
              <div>
                <strong>
                  {t('parcel', { index: parcel.index, count })} · {parcel.cartonName} ({parcel.cartonCode})
                </strong>
                <small>
                  {parcel.outerCm.join('×')} cm ·{' '}
                  {t('weights', { actual: kg(parcel.actualWeightGram), billable: kg(parcel.billableWeightGram) })}
                </small>
                <ul>
                  {parcel.items.map((item) => (
                    <li key={item.orderItemId}>
                      {item.quantity} × {item.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="package-plan-money">
                <b>{money(parcel.feeVnd)}</b>
                <small>
                  {waybill
                    ? t('waybill', { code: waybill.carrierCode || waybill.trackingNumber || '' })
                    : t('noWaybill')}
                </small>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        {order.status === 'PROCESSING' && deposited && view.missingParcels.length > 0 && (
          <button type="button" className="mu-button" disabled={busy} onClick={() => void createWaybills()}>
            {t('createWaybills', { count: view.missingParcels.length })}
          </button>
        )}
        {editable && (
          <button type="button" className="mu-button-secondary" disabled={busy} onClick={() => void replan({})}>
            {t('replan')}
          </button>
        )}
      </div>

      {editable && view.current!.alternatives.length > 0 && (
        <details className="package-plan-alternatives">
          <summary>{t('alternatives', { count: view.current!.alternatives.length })}</summary>
          <ul>
            {view.current!.alternatives.map((alternative, index) => (
              <li key={index}>
                <span>
                  {t('alternative', {
                    parcels: alternative.parcels.length,
                    cartons: alternative.parcels.map((parcel) => parcel.cartonCode).join(' + '),
                    fee: money(alternative.carrierFeeVnd),
                  })}
                </span>
                <button
                  type="button"
                  className="underline"
                  disabled={busy}
                  onClick={() => void replan({ alternative: index })}
                >
                  {t('useAlternative')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
