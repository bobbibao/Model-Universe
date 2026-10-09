'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import ProductImage from '@/components/ProductImage';
import type { Reservation } from '@/shared/types/reservation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';

export default function ReservationWorkspace({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('reservation'), locale = useLocale();
  const { user } = useCurrentUser();
  const [rows, setRows] = useState<Reservation[]>([]), [selected, setSelected] = useState<Reservation | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [action, setAction] = useState('payment');
  const [notifications, setNotifications] = useState<{ id: number; entityId: number; details: { days: number; expiresAt: string } }[]>([]);
  const root = admin ? '/admin/reservations' : '/reservations';
  const money = (value: number) => new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await Api.get(root); setRows(response.data); setFailed(false);
      if (!admin) setNotifications((await Api.get('/reservations/notifications')).data);
    }
    catch { setFailed(true); }
  }, [root, user, admin]);
  useEffect(() => { void load(); }, [load]);
  const open = async (id: number) => {
    try { setSelected((await Api.get(`${root}/${id}`)).data); }
    catch { setFailed(true); }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>, endpoint: string) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(form);
    for (const key of ['amountVnd', 'days']) if (form.has(key)) data[key] = Number(form.get(key));
    if (form.has('moneyVerified')) data.moneyVerified = form.get('moneyVerified') === 'on';
    if (form.has('acknowledgeForfeiture')) data.acknowledgeForfeiture = form.get('acknowledgeForfeiture') === 'on';
    if (endpoint === 'delivery') data.shipping = Object.fromEntries(['recipientName', 'phone', 'address', 'city', 'note'].map(key => [key, form.get(key) || '']));
    setBusy(true);
    try {
      setSelected((await Api.post(`${root}/${selected.id}/${endpoint}`, data)).data);
      await load();
    } catch { /* The shared API displays the server's verified error. */ }
    finally { setBusy(false); }
  };
  const simpleAction = async (endpoint: string) => {
    if (!selected) return;
    setBusy(true);
    try { setSelected((await Api.post(`${root}/${selected.id}/${endpoint}`)).data); await load(); }
    catch { /* The shared API reports the failure. */ }
    finally { setBusy(false); }
  };
  const uploadEvidence = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selected) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append('file',file); form.append('purpose','reservation_payment');
      const uploaded = (await Api.post('/evidence',form,{ headers: { 'Content-Type':'multipart/form-data' } })).data;
      setSelected((await Api.post(`/reservations/${selected.id}/evidence`,{ evidenceIds:[uploaded.id] })).data);
    } catch { /* The shared API reports upload validation. */ }
    finally { setBusy(false); event.target.value = ''; }
  };
  return <section className="mu-wrap py-10">
    <p className="mu-eyebrow">MODEL UNIVERSE / COLLECTOR SERVICES</p><h1 className="mu-title text-4xl">{t(admin ? 'adminTitle' : 'title')}</h1>
    <p className="mu-note max-w-3xl">{t('intro')}</p>
    <div className="mu-panel my-6 p-5"><p>{t('rules')}</p><p className="mu-note mt-2">{t('moneyNotice')}</p></div>
    {!user ? <Link className="mu-button" href="/auth/signin?redirect=/reservations">{t('signIn')}</Link> : <>
      {notifications.map(notification => <button key={notification.id} className="mu-panel mb-3 block w-full p-4 text-left" onClick={() => void open(notification.entityId)}>{t('reminder',{ id:notification.entityId, days:notification.details.days, date:new Date(notification.details.expiresAt).toLocaleDateString(locale) })}</button>)}
      {failed && <button className="mu-button" onClick={() => void load()}>{t('retry')}</button>}
      {!failed && rows.length === 0 && <div className="mu-panel p-8"><h2 className="text-xl font-bold">{t('empty')}</h2><Link className="mu-button mt-4" href="/shop">{t('explore')}</Link></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-3">{rows.map(row => <button key={row.id} onClick={() => void open(row.id)} className={`mu-panel flex w-full gap-4 p-4 text-left ${selected?.id === row.id ? 'ring-2 ring-cyan-500' : ''}`}>
          <div className="relative h-20 w-20 shrink-0"><ProductImage src={row.imageUrl} alt={row.productName} sizes="80px" className="object-contain" /></div>
          <div><span className="mu-eyebrow">#{row.id} · {t(`status.${row.status}`)}</span><h2 className="font-bold">{row.productName}</h2><p className="mu-note">{t('paid')}: {money(row.paidVnd)} / {money(row.totalVnd)}</p></div>
        </button>)}</div>
        {selected && <div className="mu-panel space-y-5 p-6">
          <div><p className="mu-eyebrow">#{selected.id} · {t(`status.${selected.status}`)}</p><h2 className="text-2xl font-bold">{selected.productName}</h2></div>
          <dl className="grid grid-cols-2 gap-3"><div><dt className="mu-note">{t('remaining')}</dt><dd className="text-xl font-bold">{money(selected.remainingVnd)}</dd></div><div><dt className="mu-note">{t('deadline')}</dt><dd>{selected.expiresAt ? new Date(selected.expiresAt).toLocaleString(locale) : t('notStarted')}</dd></div></dl>
          {selected.orderId && <Link className="mu-button" href={admin ? `/admin/orders/${selected.orderId}` : `/order-history?order=${selected.orderId}`}>{t('order')} #{selected.orderId}</Link>}
          {selected.evidence && selected.evidence.length > 0 && <div><h3 className="font-bold">{t('evidence')}</h3>{selected.evidence.map(file => <a className="mu-note block underline" key={file.id} href={`/api/evidence/${file.id}`} target="_blank" rel="noreferrer">{file.originalName}</a>)}</div>}
          {!admin && !['cancelled','completed'].includes(selected.status) && <label className="mu-field">{t('uploadEvidence')}<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void uploadEvidence(event)} /><span className="mu-note">{t('evidenceNotice')}</span></label>}
          {admin ? <>
            <label className="mu-field">{t('action')}<select value={action} onChange={event => setAction(event.target.value)}>{['payment','refund','forfeit','extend','cancel'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <form key={`${selected.id}-${action}`} onSubmit={event => void submit(event, action)} className="space-y-3">
              {['payment','refund'].includes(action) && <><label className="mu-field">{t('amount')}<input name="amountVnd" type="number" min="1" step="1" required /></label><label className="mu-field">{t('reference')}<input name="externalReference" minLength={8} maxLength={128} required /></label><label className="flex gap-2"><input name="moneyVerified" type="checkbox" required />{t('verified')}</label></>}
              {action === 'refund' && <label className="mu-field">{t('exceptionReason')}<select name="exceptionReason" required defaultValue=""><option value="" disabled>{t('chooseReason')}</option><option value="shop_fault">{t('shopFault')}</option></select></label>}
              {action === 'forfeit' && <><label className="mu-field">{t('amount')}<input name="amountVnd" type="number" min="1" step="1" required /></label><label className="mu-field">{t('reconciliationReference')}<input name="externalReference" minLength={8} maxLength={128} required /></label><label className="mu-field">{t('forfeitReason')}<select name="forfeitReason" required defaultValue=""><option value="" disabled>{t('chooseReason')}</option><option value="customer_cancel">{t('customerCancel')}</option><option value="expired_hold">{t('expiredHold')}</option></select></label></>}
              {action === 'extend' && <label className="mu-field">{t('days')}<input name="days" type="number" min="1" max="365" required /></label>}
              <label className="mu-field">{t('reason')}<textarea name="reason" required maxLength={1000} /></label><button className="mu-button" disabled={busy}>{t('record')}</button>
            </form>
            {selected.status === 'delivery_requested' && <button className="mu-button" disabled={busy} onClick={() => void simpleAction('confirm-delivery')}>{t('confirmDelivery')}</button>}
          </> : <>
            {['holding','fully_paid','delivery_requested'].includes(selected.status) && <form onSubmit={event => void submit(event, 'delivery')} className="space-y-3">
              <h3 className="font-bold">{t('delivery')}</h3><label className="mu-field">{t('method')}<select name="deliveryMethod"><option value="delivery">{t('ship')}</option><option value="pickup">{t('pickup')}</option></select></label>
              {['recipientName','phone','address','city','note'].map(key => <label className="mu-field" key={key}>{t(key)}<input name={key} required={key !== 'note'} maxLength={key === 'note' ? 500 : 255} autoComplete={key === 'phone' ? 'tel' : undefined} /></label>)}
              <p className="mu-note">{t('deliveryNotice')}</p><button className="mu-button" disabled={busy}>{t('requestDelivery')}</button>
            </form>}
            {selected.status === 'delivery_requested' && <button className="mu-button" disabled={busy} onClick={() => void simpleAction('cancel-delivery')}>{t('cancelDelivery')}</button>}
            {['awaiting_payment','holding','expired'].includes(selected.status) && <form onSubmit={event => void submit(event, 'cancel')} className="space-y-3"><p className="mu-note">{t('cancelNotice')}</p>{selected.paidVnd > 0 && <label className="flex gap-2"><input name="acknowledgeForfeiture" type="checkbox" required />{t('acknowledgeForfeiture')}</label>}<label className="mu-field">{t('reason')}<input name="reason" required maxLength={1000} /></label><button className="mu-button" disabled={busy}>{t('cancel')}</button></form>}
          </>}
          <details><summary className="cursor-pointer font-bold">{t('history')}</summary><ul className="mt-3 space-y-3">{selected.payments?.map(payment => <li key={`p-${payment.id}`} className="mu-note">{t(payment.kind === 'forfeit' ? 'forfeit' : payment.kind === 'refund' ? 'refund' : 'payment')} · {money(payment.amountVnd)} · {payment.externalReference}</li>)}{selected.events?.map(event => <li key={`e-${event.id}`} className="mu-note">{new Date(event.createdAt).toLocaleString(locale)} · {event.action} · {event.reason}</li>)}</ul></details>
        </div>}
      </div>
    </>}
  </section>;
}
