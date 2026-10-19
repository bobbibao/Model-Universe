'use client';

import DateTimeInput from '@/components/DateTimeInput';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import { vnDate } from '@/shared/fulfillment';

interface LabelRow {
  shipmentId: number;
  orderId: number;
  orderCode: string;
  carrierName: string;
  carrierCode: string;
  mode: string;
  status: string;
  createdAt: string;
  labelPrintedAt: string | null;
  printCount: number;
  recipientName: string;
  phone: string;
  address: string;
  codAmountVnd: number;
  parcel: string | null;
  carton: string | null;
  items: { name: string; quantity: number }[];
}
interface Queue {
  labels: LabelRow[];
  needsWaybill: {
    orderId: number;
    orderCode: string;
    recipientName: string;
    address: string;
    planned: boolean;
    missingParcels: number;
  }[];
  counts: { unprinted: number; printed: number; needsWaybill: number };
}
interface Batch {
  id: number;
  size: string;
  labelCount: number;
  reprintCount: number;
  createdAt: string;
  createdBy: string | null;
}

const SIZES = ['A6', '100x150', 'A4'] as const;
const pdfUrl = (id: number, download = false) =>
  `/api/admin/shipping/print-batches/${id}/labels.pdf${download ? '?download=1' : ''}`;

// End-of-day label printing: the parcels still at the shop, chosen and printed in one run (one PDF, a label per parcel,
// to the label or office printer or saved as a file), the CSV checklist, the carriers' own labels for live waybills, and
// every earlier run to download again. Paid orders without a waybill are listed first so none is forgotten.
export default function PrintCenter() {
  const t = useTranslations('printCenter'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [day, setDay] = useState(vnDate());
  const [status, setStatus] = useState<'unprinted' | 'printed' | 'all'>('unprinted');
  const [size, setSize] = useState<(typeof SIZES)[number]>('A6');
  const [queue, setQueue] = useState<Queue>();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<Batch | null>(null);
  const printFrame = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    try {
      const [queueResponse, batchResponse] = await Promise.all([
        Api.get('/admin/shipping/print-queue', { params: { day, status } }),
        Api.get('/admin/shipping/print-batches'),
      ]);
      setQueue(queueResponse.data);
      setBatches(batchResponse.data);
      setSelected(
        new Set((queueResponse.data as Queue).labels.filter((row) => !row.labelPrintedAt).map((row) => row.shipmentId)),
      );
    } catch {
      /* The toast explains it. */
    }
  }, [day, status]);
  useEffect(() => {
    void load();
  }, [load]);

  const labels = useMemo(() => queue?.labels ?? [], [queue]);
  const allSelected = labels.length > 0 && labels.every((row) => selected.has(row.shipmentId));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Prints the PDF through the browser's print dialog (any connected printer, or "Save as PDF").
  const print = (id: number) => {
    const frame = printFrame.current;
    if (!frame) return;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(pdfUrl(id), '_blank', 'noopener');
      }
    };
    frame.src = pdfUrl(id);
  };

  const createBatch = async () => {
    setBusy(true);
    try {
      const batch = (await Api.post('/admin/shipping/print-batches', { shipmentIds: [...selected], size }))
        .data as Batch;
      setCurrent(batch);
      toast.success(t('batchCreated', { id: batch.id, count: batch.labelCount }));
      await load();
      print(batch.id);
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };

  const carrierLabels = async (id: number) => {
    try {
      const result = (await Api.get(`/admin/shipping/print-batches/${id}/carrier-labels`)).data as {
        url: string | null;
      };
      if (result.url) window.open(result.url, '_blank', 'noopener');
      else toast.info(t('noLiveLabels'));
    } catch {
      /* The toast explains it. */
    }
  };

  const createWaybill = async (orderId: number, planned: boolean) => {
    setBusy(true);
    try {
      // A planned order books every parcel still without a waybill; an older order its one default package.
      if (planned)
        await Api.post(`/admin/orders/${orderId}/shipments`, { requestKey: crypto.randomUUID(), allParcels: true });
      else {
        const spec = (await Api.get(`/admin/orders/${orderId}/package`)).data;
        await Api.post(`/admin/orders/${orderId}/shipments`, { requestKey: crypto.randomUUID(), package: spec });
      }
      toast.success(t('waybillCreated'));
      await load();
    } catch {
      /* The toast explains it. */
    } finally {
      setBusy(false);
    }
  };

  const batchActions = (batch: Batch) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="mu-button" onClick={() => print(batch.id)}>
        {t('print')}
      </button>
      <a className="mu-button-secondary" href={pdfUrl(batch.id, true)}>
        {t('downloadPdf')}
      </a>
      <a className="mu-button-secondary" href={pdfUrl(batch.id)} target="_blank" rel="noreferrer">
        {t('openPdf')}
      </a>
      <a className="mu-button-secondary" href={`/api/admin/shipping/print-batches/${batch.id}/orders.csv`}>
        {t('downloadCsv')}
      </a>
      <button type="button" className="mu-button-secondary" onClick={() => void carrierLabels(batch.id)}>
        {t('carrierLabels')}
      </button>
    </div>
  );

  return (
    <section className="print-center space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mu-note">{t('intro')}</p>
      </header>

      {!!queue?.needsWaybill.length && (
        <section className="mu-panel space-y-3 border-l-4 border-warning p-5" role="alert">
          <h2 className="font-semibold">{t('needsWaybillTitle', { count: queue.needsWaybill.length })}</h2>
          <p className="mu-note">{t('needsWaybillNote')}</p>
          <ul className="space-y-2 text-sm">
            {queue.needsWaybill.map((order) => (
              <li key={order.orderId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link className="font-semibold underline" href={`/admin/orders/${order.orderId}`}>
                    {order.orderCode}
                  </Link>{' '}
                  · {order.recipientName} · {order.address}
                  {order.missingParcels > 1 ? ` · ${t('missingParcels', { count: order.missingParcels })}` : ''}
                </span>
                <button
                  type="button"
                  className="mu-button-secondary"
                  disabled={busy}
                  onClick={() => void createWaybill(order.orderId, order.planned)}
                >
                  {t('createWaybill')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mu-panel space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="mu-field">
            {t('day')}
            <DateTimeInput type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
          <button type="button" className="underline" onClick={() => setDay('')}>
            {t('allDays')}
          </button>
          <div className="flex gap-2" role="tablist" aria-label={t('statusLabel')}>
            {(['unprinted', 'printed', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                className={status === value ? 'mu-button' : 'mu-button-secondary'}
                onClick={() => setStatus(value)}
              >
                {t(`status.${value}`)}
                {value !== 'all' && queue ? ` (${queue.counts[value]})` : ''}
              </button>
            ))}
          </div>
          <label className="mu-field">
            {t('size')}
            <select value={size} onChange={(event) => setSize(event.target.value as (typeof SIZES)[number])}>
              {SIZES.map((value) => (
                <option key={value} value={value}>
                  {t(`sizes.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="print-table w-full text-sm">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label={t('selectAll')}
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(labels.map((row) => row.shipmentId)))}
                  />
                </th>
                <th>{t('columns.order')}</th>
                <th>{t('columns.carrier')}</th>
                <th>{t('columns.recipient')}</th>
                <th>{t('columns.items')}</th>
                <th>{t('columns.cod')}</th>
                <th>{t('columns.printed')}</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((row) => (
                <tr key={row.shipmentId} className={selected.has(row.shipmentId) ? 'is-selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t('select', { order: row.orderCode })}
                      checked={selected.has(row.shipmentId)}
                      onChange={() => toggle(row.shipmentId)}
                    />
                  </td>
                  <td>
                    <Link className="font-semibold underline" href={`/admin/orders/${row.orderId}`}>
                      {row.orderCode}
                    </Link>
                    {row.parcel && <span className="print-parcel">{row.parcel}</span>}
                    <small>
                      {row.carton ? `${row.carton} · ` : ''}
                      {new Date(row.createdAt).toLocaleString(locale)}
                    </small>
                  </td>
                  <td>
                    {row.carrierName}
                    <small>
                      {row.carrierCode}
                      {row.mode !== 'live' ? ` · ${t('simulated')}` : ''}
                    </small>
                  </td>
                  <td>
                    {row.recipientName} · {row.phone}
                    <small>{row.address}</small>
                  </td>
                  <td>
                    {row.items.map((item) => (
                      <small key={item.name}>
                        {item.quantity} × {item.name}
                      </small>
                    ))}
                  </td>
                  <td className="whitespace-nowrap font-semibold">
                    {row.codAmountVnd > 0 ? money(row.codAmountVnd) : t('paidInFull')}
                  </td>
                  <td>
                    {row.labelPrintedAt ? (
                      <small>
                        {t('printedTimes', { count: row.printCount })} ·{' '}
                        {new Date(row.labelPrintedAt).toLocaleString(locale)}
                      </small>
                    ) : (
                      <small>{t('notPrinted')}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue && labels.length === 0 && <p className="mu-note py-6 text-center">{t('empty')}</p>}
        </div>

        <div className="print-actions">
          <span>{t('selected', { count: selected.size })}</span>
          <button
            type="button"
            className="mu-button"
            disabled={busy || selected.size === 0}
            onClick={() => void createBatch()}
          >
            {t('createBatch')}
          </button>
        </div>
      </section>

      {current && (
        <section className="mu-panel space-y-3 p-5" aria-live="polite">
          <h2 className="font-semibold">{t('currentBatch', { id: current.id, count: current.labelCount })}</h2>
          <p className="mu-note">{t('printHint')}</p>
          {batchActions(current)}
        </section>
      )}

      <section className="mu-panel space-y-3 p-5">
        <h2 className="font-semibold">{t('historyTitle')}</h2>
        {batches.length === 0 ? (
          <p className="mu-note">{t('noHistory')}</p>
        ) : (
          <ul className="space-y-3">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke pt-3"
              >
                <span className="text-sm">
                  <strong>#{batch.id}</strong> · {new Date(batch.createdAt).toLocaleString(locale)} ·{' '}
                  {t('labelCount', { count: batch.labelCount })} · {t(`sizes.${batch.size}`)}
                  {batch.reprintCount ? ` · ${t('reprints', { count: batch.reprintCount })}` : ''}
                  {batch.createdBy ? ` · ${batch.createdBy}` : ''}
                </span>
                {batchActions(batch)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <iframe ref={printFrame} title={t('print')} className="hidden" />
    </section>
  );
}
