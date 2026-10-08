'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import type { HistoricalClaim, Redemption } from '@/shared/types/loyalty';
import { formatVND } from '@/shared/server/utils/utils';

export default function MembershipOperations() {
  const t = useTranslations('loyalty'), common = useTranslations('common'), locale = useLocale();
  const [queues,setQueues] = useState<{claims:HistoricalClaim[];gifts:Redemption[]}>({claims:[],gifts:[]}), [selected,setSelected] = useState<HistoricalClaim|null>(null);
  const [busy,setBusy] = useState(false), [failed,setFailed] = useState(false), [decision,setDecision] = useState('approved');
  const load = useCallback(async () => {
    try { setQueues((await Api.get('/admin/loyalty')).data); setFailed(false); }
    catch { setFailed(true); }
  },[]);
  useEffect(() => { void load(); },[load]);
  const open = async (id:number) => { try { setSelected((await Api.get(`/admin/loyalty/claims/${id}`)).data); } catch { /* The API reports the failure. */ } };
  const submit = async (event:React.FormEvent<HTMLFormElement>, endpoint:string, numericKeys:string[], flags:string[] = []) => {
    event.preventDefault(); const formElement = event.currentTarget, form = new FormData(formElement), values:Record<string,unknown> = Object.fromEntries(form);
    numericKeys.forEach(key => {values[key] = Number(form.get(key));}); flags.forEach(key => {values[key] = form.get(key) === 'on';});
    setBusy(true);
    try { await Api.post(endpoint,values); formElement.reset(); setSelected(null); await load(); }
    catch { /* Preserve entered fields for correction; the shared API reports the failure. */ }
    finally { setBusy(false); }
  };
  const field = (name:string,type = 'text', required = true) => <label key={name} className="mu-field">{t(name)}<input name={name} type={type} required={required} step={type === 'number' ? '1' : undefined} /></label>;
  return <section className="mu-wrap space-y-6 py-8"><p className="mu-eyebrow">MODEL UNIVERSE / OPERATIONS</p><h1 className="mu-title text-4xl">{t('adminTitle')}</h1>
    {failed && <button className="mu-button" onClick={() => void load()}>{common('retry')}</button>}
    <div className="grid gap-6 lg:grid-cols-2"><section className="mu-panel p-5"><h2 className="text-xl font-bold">{t('claims')}</h2>{queues.claims.map(claim => <button className="my-3 block w-full rounded-lg border p-4 text-left" key={claim.id} onClick={() => void open(claim.id)}>#{claim.id} · {claim.transactionReference}<p className="mu-note">{formatVND(claim.claimedVnd,locale)} · {t('userId')} {claim.userId}</p><span className="mu-note underline">{t('review')}</span></button>)}{!queues.claims.length && <p className="mu-note">{t('emptyQueue')}</p>}</section>
      <section className="mu-panel p-5"><h2 className="text-xl font-bold">{t('gifts')}</h2>{queues.gifts.map(gift => <article key={gift.id} className="my-4 border-b pb-4"><h3 className="font-bold">#{gift.id} · {gift.rewardSnapshot.name} · {t(`status.${gift.status}`)}</h3><p className="mu-note">{t('userId')} {gift.userId}</p>{gift.shipping && <p className="mu-note">{Object.values(gift.shipping).filter(Boolean).join(' · ')}</p>}{gift.status === 'requested' && <form className="mt-3 space-y-3" onSubmit={event => void submit(event,`/admin/loyalty/gifts/${gift.id}/fulfill`,[],['handoverVerified'])}>{field('fulfillmentReference')}<label className="flex gap-2"><input name="handoverVerified" type="checkbox" required />{t('handoverVerified')}</label><button className="mu-button" disabled={busy}>{t('fulfill')}</button></form>}</article>)}{!queues.gifts.length && <p className="mu-note">{t('emptyQueue')}</p>}</section></div>
    {selected && <section className="mu-panel p-5"><h2 className="text-xl font-bold">{t('review')} #{selected.id}</h2><p className="mu-note">{selected.transactionReference} · {new Date(selected.transactionDate).toLocaleDateString(locale)} · {formatVND(selected.claimedVnd,locale)}</p>{selected.evidence?.map(file => <a key={file.id} href={`/api/evidence/${file.id}`} target="_blank" rel="noreferrer" className="mu-note mr-4 underline">{file.originalName}</a>)}
      <form className="mt-4 space-y-3" onSubmit={event => void submit(event,`/admin/loyalty/claims/${selected.id}/review`,decision === 'approved' ? ['recognizedVnd'] : [],['transactionVerified'])}><label className="mu-field">{t('decision')}<select name="decision" value={decision} onChange={event => setDecision(event.target.value)}>{['approved','rejected'].map(value => <option key={value} value={value}>{t(`status.${value}`)}</option>)}</select></label>{decision === 'approved' && <><label className="mu-field">{t('recognizedAmount')}<input type="number" name="recognizedVnd" step="1" min="1" required /></label>{field('verifiedReference')}<label className="flex gap-2"><input type="checkbox" name="transactionVerified" required />{t('transactionVerified')}</label></>}<label className="mu-field">{t('reason')}<textarea name="reason" required maxLength={1000} /></label><button className="mu-button" disabled={busy}>{common('confirm')}</button></form></section>}
    <div className="grid gap-6 lg:grid-cols-2"><form className="mu-panel space-y-3 p-5" onSubmit={event => void submit(event,'/admin/loyalty/gifts',['productId','pointsCost'])}><h2 className="text-xl font-bold">{t('createGift')}</h2>{field('productId','number')}{field('pointsCost','number')}{field('titleEn')}{field('titleVi')}<button className="mu-button" disabled={busy}>{common('confirm')}</button></form>
      <form className="mu-panel space-y-3 p-5" onSubmit={event => {const id = new FormData(event.currentTarget).get('orderId'); void submit(event,`/admin/loyalty/orders/${id}/refunds`,['merchandiseVnd','shippingVnd','taxVnd'],['moneyVerified']);}}><h2 className="text-xl font-bold">{t('refund')}</h2>{field('orderId','number')}{field('merchandiseVnd','number')}{field('shippingVnd','number')}{field('taxVnd','number')}{field('externalReference')}<label className="mu-field">{t('reason')}<textarea name="reason" required maxLength={1000} /></label><label className="flex gap-2"><input type="checkbox" name="moneyVerified" required />{t('moneyVerified')}</label><button className="mu-button" disabled={busy}>{common('confirm')}</button></form>
      <form className="mu-panel space-y-3 p-5" onSubmit={event => {const input = event.currentTarget.elements.namedItem('requestKey') as HTMLInputElement; if(!input.value) input.value = crypto.randomUUID(); void submit(event,'/admin/loyalty/adjustments',['userId','pointsDelta']);}}><h2 className="text-xl font-bold">{t('adjust')}</h2>{field('userId','number')}{field('pointsDelta','number')}<input type="hidden" name="requestKey" /><label className="mu-field">{t('reason')}<textarea name="reason" required maxLength={1000} /></label><button className="mu-button" disabled={busy}>{common('confirm')}</button></form></div>
  </section>;
}
