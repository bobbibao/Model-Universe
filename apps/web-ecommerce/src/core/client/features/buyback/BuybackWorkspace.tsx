'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import CollectibleSubmissionForm, { COLLECTIBLE_ASSET_FIELDS as ASSET_FIELDS } from './CollectibleSubmissionForm';
import { formatVND } from '@/shared/server/utils/utils';
import type { BuybackRequest } from '@/shared/types/buyback';
import ProductPicker, { type PickedProduct } from '@/core/client/features/inventory/components/ProductPicker';

export default function BuybackWorkspace({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('buyback'), common = useTranslations('common'), catalog = useTranslations('catalog'), locale = useLocale();
  const { user } = useCurrentUser();
  const [rows, setRows] = useState<BuybackRequest[]>([]), [selected, setSelected] = useState<BuybackRequest | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [showForm, setShowForm] = useState(false);
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const root = admin ? '/admin/buyback' : '/buyback';
  const load = useCallback(async () => {
    if (!user) return;
    try { setRows((await Api.get(root)).data); setFailed(false); }
    catch { setFailed(true); }
  }, [root, user]);
  useEffect(() => {
    setRows([]); setSelected(null); setProduct(null);
    void load();
  }, [load]);
  useEffect(() => {
    if (selected?.id && matchMedia('(max-width: 1023px)').matches) document.getElementById('buyback-detail')?.scrollIntoView({ block: 'start' });
  }, [selected?.id]);
  const open = async (id: number) => {
    setBusy(true);
    try { setSelected((await Api.get(`${root}/${id}`)).data); setProduct(null); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const post = async (endpoint: string, data: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    try { setSelected((await Api.post(`${root}/${selected.id}/${endpoint}`, { ...data, expectedVersion: selected.version })).data); await load(); }
    catch { await open(selected.id); }
    finally { setBusy(false); }
  };
  const submitAction = (event: React.FormEvent<HTMLFormElement>, action: string, endpoint = 'actions') => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), data: Record<string, unknown> = { ...Object.fromEntries(form), action };
    if (form.has('amountVnd')) data.amountVnd = Number(form.get('amountVnd'));
    for (const key of ['moneyVerified', 'handoverVerified', 'actualPhotosVerified']) if (form.has(key)) data[key] = true;
    if (action === 'send_item') data.inboundCod = false;
    if (endpoint === 'intake') data.productId = product?.id;
    void post(endpoint, data);
  };
  const detailsField = <label className="mu-field">{t('details')}<textarea name="details" required maxLength={1500} /></label>;
  const referenceField = <label className="mu-field">{t('tracking')}<input name="inboundReference" maxLength={255} required /></label>;
  const offerField = <label className="mu-field">{t('amount')}<input name="amountVnd" type="number" min="1" max="2147483647" step="1" required /></label>;
  const verifyHandover = <label className="flex items-start gap-3 text-sm"><input name="handoverVerified" type="checkbox" required />{t('handoverVerified')}</label>;
  const button = (name: string) => <button className="mu-button" disabled={busy}>{t(name)}</button>;
  return <section className={admin ? 'py-6' : 'mu-wrap py-12'}>
    <p className="mu-eyebrow">MODEL UNIVERSE / COLLECTOR SERVICES</p>
    <h1 className="mu-heading mt-4">{t(admin ? 'adminTitle' : 'title')}</h1>
    <p className="mu-note max-w-3xl">{t('intro')}</p>
    <ol className="my-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t('process')}>
      {['submit', 'inspect', 'agree', 'getPaid'].map((step, index) => <li className="mu-panel p-4" key={step}><span className="mu-eyebrow">0{index + 1}</span><p className="mt-2 font-bold">{t(`steps.${step}`)}</p></li>)}
    </ol>
    <div className="mu-panel mb-6 p-5"><p className="font-semibold">{t('ownershipNote')}</p><p className="mu-note">{t('codNote')}</p></div>
    {!user ? <Link className="mu-button" href="/auth/signin?redirect=/services/sell">{t('signIn')}</Link> : <>
      {failed && <button className="mu-button mb-5" onClick={() => void load()}>{common('retry')}</button>}
      {!admin && <button className="mu-button mb-6" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>{t('newRequest')}</button>}
      {!admin && showForm && <CollectibleSubmissionForm key={user.id} purpose="buyback" onCreated={async id => { await open(id); setShowForm(false); await load(); }} />}
      {!failed && !rows.length && <p className="mu-note mb-6">{t('empty')}</p>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">{rows.map(row => <button key={row.id} disabled={busy} aria-pressed={selected?.id === row.id} onClick={() => void open(row.id)} className={`mu-panel w-full p-5 text-left ${selected?.id === row.id ? 'ring-2 ring-cyan-600' : ''}`}><p className="mu-eyebrow">#{row.id} · {t(`status.${row.status}`)}</p><h2 className="mt-2 font-bold">{row.asset.name}</h2><p className="mu-note">{row.asset.modelCode} · {row.asset.version}</p><p className="mu-note">{new Date(row.createdAt).toLocaleDateString(locale)}</p></button>)}</div>
        {selected && <div id="buyback-detail" className="mu-panel order-first min-w-0 scroll-mt-24 space-y-6 p-5 sm:p-7 lg:order-none">
          <div><p className="mu-eyebrow">#{selected.id} · {t(`status.${selected.status}`)}</p><h2 className="mt-3 text-2xl font-bold">{selected.asset.name}</h2><p className="mu-note">{t('version', { version: selected.version })}</p></div>
          <dl className="grid gap-3 sm:grid-cols-2">{ASSET_FIELDS.filter(key => key !== 'name').map(key => <div key={key}><dt className="mu-note">{t(`asset.${key}`)}</dt><dd className="break-words whitespace-pre-line">{key === 'assemblyState' ? catalog(selected.asset[key]) : selected.asset[key]}</dd></div>)}</dl>
          <div><h3 className="font-bold">{t('photos')}</h3><div className="mt-3 flex flex-wrap gap-3">{selected.evidence.map(file => <a key={file.id} href={`/api/evidence/${file.id}`} target="_blank" rel="noreferrer" className="text-sm underline">{file.originalName}</a>)}</div></div>
          {selected.inboundReference && <p className="mu-note">{t('tracking')}: {selected.inboundReference}</p>}
          {selected.inspection && <div><h3 className="font-bold">{t('inspection')}</h3><p className="mu-note whitespace-pre-line">{selected.inspection}</p></div>}
          {(['preliminaryOffer', 'finalOffer'] as const).map(key => selected[key] && <div key={key} className="rounded-lg border border-slate-200 p-4"><h3 className="font-bold">{t(key)}</h3><p className="mt-2 text-2xl font-bold">{formatVND(selected[key]!.amountVnd, locale)}</p><p className="mu-note whitespace-pre-line">{selected[key]!.details}</p><p className="mu-note">{t(key === 'preliminaryOffer' ? 'preliminaryNote' : 'finalNote')}</p></div>)}
          {selected.payout && <div className="rounded-lg bg-cyan-50 p-4"><h3 className="font-bold">{t('paid')}</h3><p className="mt-2 font-bold">{formatVND(selected.payout.amountVnd, locale)}</p><p className="mu-note break-all">{selected.payout.externalReference} · {new Date(selected.payout.createdAt).toLocaleString(locale)}</p></div>}
          {selected.returnTerms && <div><h3 className="font-bold">{t('returnTerms')}</h3><p className="mu-note">{selected.returnTerms.details}</p><p className="mu-note">{t(selected.returnTerms.accepted ? 'returnAccepted' : 'returnPending')}</p>{selected.returnTerms.tracking && <p className="mu-note">{selected.returnTerms.tracking}</p>}</div>}
          {!admin && selected.status === 'quoted' && <form className="space-y-4" onSubmit={event => submitAction(event, 'send_item')}>{referenceField}<p className="mu-note">{t('codNote')}</p>{button('sendItem')}</form>}
          {!admin && selected.status === 'awaiting_acceptance' && <div className="space-y-4"><p className="mu-note">{t('acceptNote')}</p><button className="mu-button" disabled={busy} onClick={() => void post('actions', { action: 'accept' })}>{t('accept')}</button><form className="space-y-3" onSubmit={event => submitAction(event, 'reject')}>{detailsField}{button('reject')}</form></div>}
          {!admin && ['submitted', 'quoted', 'awaiting_item', 'inspecting'].includes(selected.status) && <form className="space-y-4 border-t border-slate-200 pt-4" onSubmit={event => submitAction(event, 'cancel')}>{detailsField}{button('cancelRequest')}</form>}
          {!admin && selected.status === 'returning' && selected.returnTerms && !selected.returnTerms.accepted && <button className="mu-button" disabled={busy} onClick={() => void post('actions', { action: 'accept_return' })}>{t('acceptReturn')}</button>}
          {admin && ['submitted', 'quoted'].includes(selected.status) && <form className="space-y-4" onSubmit={event => submitAction(event, 'preliminary_offer')}>{offerField}{detailsField}{button('preliminaryOffer')}</form>}
          {admin && selected.status === 'awaiting_item' && <form className="space-y-4" onSubmit={event => submitAction(event, 'received')}>{detailsField}{verifyHandover}{button('inspect')}</form>}
          {admin && ['inspecting', 'awaiting_acceptance'].includes(selected.status) && <form className="space-y-4" onSubmit={event => submitAction(event, 'final_offer')}>{offerField}{detailsField}{button('finalOffer')}</form>}
          {admin && selected.status === 'awaiting_payout' && <form className="space-y-4" onSubmit={event => submitAction(event, 'payout', 'payout')}><p className="mu-note">{t('payoutNote')}</p><label className="mu-field">{t('amount')}<input name="amountVnd" type="number" step="1" min="1" required defaultValue={selected.finalOffer?.amountVnd} /></label><label className="mu-field">{t('reference')}<input name="externalReference" minLength={8} maxLength={128} required /></label>{detailsField}<label className="flex items-start gap-3 text-sm"><input name="moneyVerified" type="checkbox" required />{t('moneyVerified')}</label>{button('pay')}</form>}
          {admin && selected.status === 'returning' && !selected.returnTerms?.accepted && <form className="space-y-4" onSubmit={event => submitAction(event, 'return_offer')}>{detailsField}<p className="mu-note">{t('returnNote')}</p>{button('returnTerms')}</form>}
          {admin && selected.status === 'returning' && selected.returnTerms?.accepted && <form className="space-y-4" onSubmit={event => submitAction(event, 'return_dispatched')}>{referenceField}{verifyHandover}{button('returnDispatch')}</form>}
          {admin && selected.status === 'completed' && !selected.productId && <form className="space-y-4" onSubmit={event => submitAction(event, 'intake', 'intake')}><h3 className="font-bold">{t('intake')}</h3><p className="mu-note">{t('intakeNote')}</p><Link href="/admin/products/new" className="inline-block underline">{t('createDraft')}</Link><ProductPicker value={product} onChange={setProduct} excludeIds={[]} />{detailsField}<label className="flex items-start gap-3 text-sm"><input name="actualPhotosVerified" type="checkbox" required />{t('actualPhotosVerified')}</label><button className="mu-button" disabled={busy || !product}>{t('intake')}</button></form>}
          {selected.productId && <Link className="mu-button" href={admin ? `/admin/products/${selected.productId}` : `/shop/product/${selected.productId}`}>{t('listedModel')}</Link>}
          <div className="border-t border-slate-200 pt-5"><h3 className="font-bold">{t('history')}</h3><ol className="mt-3 space-y-3">{selected.events.map(event => {
            const offer = (event.details.offer || event.details.acceptedOffer) as { amountVnd: number; details: string } | undefined;
            const returnTerms = (event.details.returnTerms || event.details.acceptedReturnTerms) as { details: string } | undefined;
            const notes = [event.details.reason, event.details.inspection, event.details.note, returnTerms?.details].filter((value): value is string => typeof value === 'string');
            return <li key={event.id} className="mu-note"><span className="font-semibold">{t('events.' + event.action)}</span> · {new Date(event.createdAt).toLocaleString(locale)} · {t('version', { version: Number(event.details.version) })}
              {Boolean(offer || notes.length > 0 || event.details.externalReference || event.details.inboundReference || event.details.tracking) && <details className="mt-2"><summary className="cursor-pointer underline">{t('historyDetails')}</summary><div className="mt-2 space-y-2">
                {offer && <p className="whitespace-pre-line">{formatVND(offer.amountVnd, locale)} · {offer.details}</p>}
                {typeof event.details.amountVnd === 'number' && <p>{formatVND(event.details.amountVnd, locale)}</p>}
                {notes.map((note,index) => <p className="whitespace-pre-line" key={index}>{note}</p>)}
                {[event.details.externalReference, event.details.inboundReference, event.details.tracking].filter((value): value is string => typeof value === 'string').map((value,index) => <p className="break-all" key={index}>{value}</p>)}
              </div></details>}
            </li>;
          })}</ol></div>
        </div>}
      </div>
    </>}
  </section>;
}
