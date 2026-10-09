'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { formatVND } from '@/shared/server/utils/utils';
import { PAWN_DAY_MS, pawnInterest } from '@/shared/pawn-rules';
import type { PawnContract, PawnTerms } from '@/shared/types/pawn';
import CollectibleSubmissionForm, { COLLECTIBLE_ASSET_FIELDS } from '@/core/client/features/buyback/CollectibleSubmissionForm';
import ProductPicker, { type PickedProduct } from '@/core/client/features/inventory/components/ProductPicker';
import PawnDisposalPanel from './PawnDisposalPanel';

export default function PawnWorkspace({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('pawn'), assetLabels = useTranslations('buyback'), common = useTranslations('common'), catalog = useTranslations('catalog'), policyLabels = useTranslations('policy'), locale = useLocale();
  const { user } = useCurrentUser();
  const [rows, setRows] = useState<PawnContract[]>([]), [selected, setSelected] = useState<PawnContract | null>(null);
  const [notifications, setNotifications] = useState<{ id: number; entityId: number; kind: 'pawn_due' | 'pawn_overdue'; details: { dueAt: string; days: number } }[]>([]);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [showForm, setShowForm] = useState(false);
  const [contractUploads, setContractUploads] = useState<{ id: number; name: string }[]>([]), [product, setProduct] = useState<PickedProduct | null>(null);
  const root = admin ? '/admin/pawn' : '/pawn';
  const load = useCallback(async () => {
    if (!user) return;
    try { setRows((await Api.get(root)).data); if (!admin) setNotifications((await Api.get('/pawn/notifications')).data); setFailed(false); }
    catch { setFailed(true); }
  }, [admin, root, user]);
  useEffect(() => { setRows([]); setNotifications([]); setSelected(null); setContractUploads([]); setProduct(null); void load(); }, [load]);
  useEffect(() => {
    if (admin || busy || !selected || !['active', 'repaid'].includes(selected.status)) return;
    const id = selected.id;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const updated = (await Api.get(`${root}/${id}`)).data;
        if (!cancelled) setSelected(current => current?.id === id ? updated : current);
      } catch { if (!cancelled) setFailed(true); }
    }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [admin, busy, root, selected?.id, selected?.status, user?.id]);
  useEffect(() => {
    if (selected?.id && matchMedia('(max-width: 1023px)').matches) document.getElementById('pawn-detail')?.scrollIntoView({ block: 'start' });
  }, [selected?.id]);
  const open = async (id: number) => {
    setBusy(true);
    try { setSelected((await Api.get(`${root}/${id}`)).data); setContractUploads([]); setProduct(null); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const post = async (endpoint: string, data: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    try { setSelected((await Api.post(`${root}/${selected.id}/${endpoint}`, { ...data, expectedVersion: selected.version })).data); setContractUploads([]); await load(); }
    catch { await open(selected.id); }
    finally { setBusy(false); }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>, action: string, endpoint = 'actions') => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), data: Record<string, unknown> = { ...Object.fromEntries(form), action };
    for (const key of ['appraisalVnd', 'principalVnd', 'termDays', 'amountVnd']) if (form.has(key)) data[key] = Number(form.get(key));
    for (const key of ['moneyVerified', 'handoverVerified', 'conditionMatchesAgreement', 'bilateralSignatureVerified', 'termsAccepted', 'disposalTermsAccepted', 'contractEligibilityVerified', 'authorized', 'actualPhotosVerified']) data[key] = form.has(key);
    if (action === 'quote') data.disposalAfterGrace = form.get('disposalAfterGrace') === 'yes';
    if (action === 'extension_decision') data.accepted = form.get('accepted') === 'yes';
    if (action === 'request_extension') data.proposedDueAt = new Date(String(form.get('proposedDueAt'))).toISOString();
    if (endpoint === 'intake') data.productId = product?.id;
    void post(endpoint, data);
  };
  const uploadContract = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target, file = input.files?.[0];
    if (!file || !selected) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('purpose', 'pawn');
      const saved = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
      setContractUploads(current => [...current, { id: saved.id, name: file.name }]);
    } catch { /* Shared API reports the validated private document upload error. */ }
    finally { setBusy(false); input.value = ''; }
  };
  const detailsField = <label className="mu-field">{t('details')}<textarea name="details" maxLength={1500} required /></label>;
  const verifyHandover = <label className="flex items-start gap-3 text-sm"><input name="handoverVerified" type="checkbox" required />{t('handoverVerified')}</label>;
  const button = (key: string) => <button className="mu-button" disabled={busy}>{t(key)}</button>;
  const terms = selected?.terms;
  const forecast = terms ? pawnInterest(terms.principalVnd, terms.policy, new Date(0), new Date(terms.termDays * PAWN_DAY_MS)).interestVnd : 0;
  return <section className={admin ? 'py-6' : 'mu-wrap py-12'}>
    <p className="mu-eyebrow">MODEL UNIVERSE / COLLECTOR SERVICES</p>
    <h1 className="mu-heading mt-4">{t(admin ? 'adminTitle' : 'title')}</h1>
    <p className="mu-note max-w-3xl">{t('intro')}</p>
    <div className="mu-panel my-7 p-5"><h2 className="font-bold">{t('custodyNote')}</h2><p className="mu-note">{t('capNote')}</p></div>
    {!user ? <Link className="mu-button" href="/auth/signin?redirect=/services/pawn">{t('signIn')}</Link> : <>
      {failed && <button className="mu-button mb-5" onClick={() => void load()}>{common('retry')}</button>}
      {!admin && <button className="mu-button mb-6" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>{t('newRequest')}</button>}
      {!admin && showForm && <CollectibleSubmissionForm key={user.id} purpose="pawn" onCreated={async id => { await open(id); setShowForm(false); await load(); }} />}
      {!admin && notifications.map(notification => <button key={notification.id} className="mu-panel mb-3 block w-full p-4 text-left" onClick={() => void open(notification.entityId)}>{t(notification.kind === 'pawn_overdue' ? 'overdueReminder' : 'dueReminder', { id: notification.entityId, days: notification.details.days, date: new Date(notification.details.dueAt).toLocaleString(locale) })}</button>)}
      {!failed && !rows.length && <p className="mu-note">{t('empty')}</p>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">{rows.map(row => <button className={`mu-panel w-full p-5 text-left ${selected?.id === row.id ? 'ring-2 ring-cyan-600' : ''}`} key={row.id} onClick={() => void open(row.id)} disabled={busy} aria-pressed={selected?.id === row.id}><p className="mu-eyebrow">#{row.id} · {t(`status.${row.status}`)}</p><h2 className="mt-2 font-bold">{row.asset.name}</h2><p className="mu-note">{row.asset.modelCode} · {row.asset.version}</p>{row.overdue && <p className="mt-2 font-semibold text-red-700">{t('overdue')}</p>}</button>)}</div>
        {selected && <div id="pawn-detail" className="mu-panel order-first min-w-0 scroll-mt-24 space-y-6 p-5 sm:p-7 lg:order-none">
          <div><p className="mu-eyebrow">#{selected.id} · {t(`status.${selected.status}`)}</p><h2 className="mt-3 text-2xl font-bold">{selected.asset.name}</h2><p className="mu-note">{assetLabels('version', { version: selected.version })}</p></div>
          <dl className="grid gap-3 sm:grid-cols-2">{COLLECTIBLE_ASSET_FIELDS.filter(key => key !== 'name').map(key => <div key={key}><dt className="mu-note">{assetLabels(`asset.${key}`)}</dt><dd className="break-words whitespace-pre-line">{key === 'assemblyState' ? catalog(selected.asset[key]) : selected.asset[key]}</dd></div>)}</dl>
          <div><h3 className="font-bold">{assetLabels('photos')}</h3><div className="mt-3 flex flex-wrap gap-3">{selected.evidence.map(file => <a className="text-sm underline" key={file.id} href={`/api/evidence/${file.id}`} target="_blank" rel="noreferrer">{selected.contractEvidenceIds.includes(file.id) ? `${t('signedContract')}: ` : ''}{file.originalName}</a>)}</div></div>
          {terms && <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <h3 className="text-xl font-bold">{t('terms')}</h3>
            <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="mu-note">{t('appraisal')}</dt><dd>{formatVND(terms.appraisalVnd, locale)}</dd></div><div><dt className="mu-note">{t('principal')}</dt><dd className="text-xl font-bold">{formatVND(terms.principalVnd, locale)}</dd></div><div><dt className="mu-note">{t('dailyRate')}</dt><dd>{terms.policy.dailyRateBasisPoints / 100}%</dd></div><div><dt className="mu-note">{t('termDays')}</dt><dd>{terms.termDays}</dd></div><div><dt className="mu-note">{t('forecast')}</dt><dd>{formatVND(forecast, locale)}</dd></div><div><dt className="mu-note">{policyLabels('fields.graceDays')}</dt><dd>{terms.policy.graceDays}</dd></div></dl>
            <p className="mu-note">{policyLabels(`values.${terms.policy.dayCount}`)} · {policyLabels(`values.${terms.policy.rounding}`)}</p><p className="mu-note">{policyLabels(`values.${terms.policy.interestStopEvent}`)}</p>
            <p className="whitespace-pre-line">{terms.contractText}</p><p className="mu-note">{t(terms.disposalAfterGrace ? 'disposalAgreed' : 'disposalNotAgreed')}</p><p className="mu-note">{t('startNote')}</p>
          </div>}
          {selected.contractReference && <p className="mu-note">{t('contractReference')}: {selected.contractReference}</p>}
          {selected.custodyReference && <p className="mu-note">{t('custodyReference')}: {selected.custodyReference}</p>}
          {selected.disbursedAt && <div className="rounded-lg bg-cyan-50 p-4"><h3 className="font-bold">{t('redemptionEstimate')}</h3><p className="mt-3 text-3xl font-bold">{formatVND(selected.estimate.remainingVnd, locale)}</p><p className="mu-note">{t('interest')}: {formatVND(selected.estimate.interestVnd, locale)} · {t('chargedDays', { days: selected.estimate.days })}</p><p className="mu-note">{t('collected')}: {formatVND(selected.estimate.collectedVnd, locale)}</p><p className="mu-note">{t('asOf', { date: new Date(selected.estimate.asOf).toLocaleString(locale) })}</p><p className="mu-note">{t('dueAt')}: {selected.dueAt ? new Date(selected.dueAt).toLocaleString(locale) : '—'}</p>{selected.overdue && <p className="mt-2 font-semibold text-red-700">{t('overdue')}</p>}<button className="mt-3 underline" disabled={busy} onClick={() => void open(selected.id)}>{t('refreshEstimate')}</button></div>}
          {!admin && selected.status === 'quoted' && <form aria-label={t('accept')} className="space-y-4" onSubmit={event => submit(event, 'accept')}><label className="flex items-start gap-3 text-sm"><input name="termsAccepted" type="checkbox" required />{t('termsAccepted')}</label>{terms?.disposalAfterGrace && <label className="flex items-start gap-3 text-sm"><input name="disposalTermsAccepted" type="checkbox" required />{t('disposalTermsAccepted')}</label>}{button('accept')}</form>}
          {!admin && selected.status === 'accepted' && !selected.contractEvidenceIds.length && <div className="space-y-4"><h3 className="font-bold">{t('signedContract')}</h3><p className="mu-note">{t('signedContractNote')}</p><label className="mu-field">{t('uploadContract')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || contractUploads.length >= 12} onChange={event => void uploadContract(event)} /></label>{contractUploads.map(file => <p className="mu-note" key={file.id}>{file.name}</p>)}<button className="mu-button" disabled={busy || !contractUploads.length} onClick={() => void post('actions', { action: 'attach_contract', evidenceIds: contractUploads.map(file => file.id) })}>{t('attachContract')}</button></div>}
          {!admin && selected.status === 'active' && !selected.extensionRequest && <form aria-label={t('requestExtension')} className="space-y-4" onSubmit={event => submit(event, 'request_extension')}><h3 className="font-bold">{t('requestExtension')}</h3><label className="mu-field">{t('proposedDueAt')}<input name="proposedDueAt" type="datetime-local" required /></label>{detailsField}<p className="mu-note">{t('extensionNote')}</p>{button('requestExtension')}</form>}
          {!admin && !selected.disbursedAt && !selected.custodyAt && selected.status !== 'cancelled' && <form aria-label={t('cancelRequest')} className="space-y-4 border-t border-slate-200 pt-4" onSubmit={event => submit(event, 'cancel')}>{detailsField}{button('cancelRequest')}</form>}
          {selected.extensionRequest && <div><h3 className="font-bold">{t('pendingExtension')}</h3><p className="mu-note">{new Date(selected.extensionRequest.proposedDueAt).toLocaleString(locale)} · {selected.extensionRequest.reason}</p></div>}
          {admin && !selected.disbursedAt && ['submitted', 'quoted', 'accepted', 'contract_confirmed', 'in_custody'].includes(selected.status) && <form aria-label={t('quote')} className="space-y-4" onSubmit={event => submit(event, 'quote')}><h3 className="font-bold">{t('quote')}</h3><label className="mu-field">{t('appraisal')}<input name="appraisalVnd" type="number" min="1" step="1" required defaultValue={terms?.appraisalVnd} /></label><label className="mu-field">{t('principal')}<input name="principalVnd" type="number" min="1" step="1" required defaultValue={terms?.principalVnd} /></label><label className="mu-field">{t('termDays')}<input name="termDays" type="number" min="1" max="365" step="1" required defaultValue={terms?.termDays} /></label><label className="mu-field">{t('details')}<textarea name="details" maxLength={5000} required defaultValue={terms?.contractText} /></label><label className="mu-field">{t('disposalChoice')}<select name="disposalAfterGrace" required defaultValue=""><option value="" disabled>{common('select')}</option><option value="yes">{t('disposalAgreed')}</option><option value="no">{t('disposalNotAgreed')}</option></select></label><p className="mu-note">{t('quoteNote')}</p>{button('quote')}</form>}
          {admin && selected.status === 'accepted' && !!selected.contractEvidenceIds.length && <form aria-label={t('confirmContract')} className="space-y-4" onSubmit={event => submit(event, 'confirm_contract')}><label className="mu-field">{t('contractReference')}<input name="contractReference" maxLength={255} required /></label><label className="flex items-start gap-3 text-sm"><input name="bilateralSignatureVerified" type="checkbox" required />{t('signatureVerified')}</label>{button('confirmContract')}</form>}
          {admin && selected.status === 'contract_confirmed' && <form aria-label={t('receiveAsset')} className="space-y-4" onSubmit={event => submit(event, 'receive_asset')}><label className="mu-field">{t('custodyReference')}<input name="custodyReference" maxLength={255} required /></label>{detailsField}{verifyHandover}<label className="flex items-start gap-3 text-sm"><input name="conditionMatchesAgreement" type="checkbox" required />{t('conditionMatches')}</label>{button('receiveAsset')}</form>}
          {admin && terms && (selected.status === 'in_custody' || (['active', 'repaid'].includes(selected.status) && selected.estimate.remainingVnd > 0)) && <form aria-label={t(selected.status === 'in_custody' ? 'disbursement' : 'redemption')} className="space-y-4" key={`${selected.id}:${selected.version}:${selected.estimate.remainingVnd}`} onSubmit={event => submit(event, selected.status === 'in_custody' ? 'disbursement' : 'redemption', selected.status === 'in_custody' ? 'disbursement' : 'redemption')}><h3 className="font-bold">{t(selected.status === 'in_custody' ? 'disbursement' : 'redemption')}</h3><label className="mu-field">{t('amount')}<input name="amountVnd" type="number" min="1" step="1" required defaultValue={selected.status === 'in_custody' ? terms.principalVnd : selected.estimate.remainingVnd} /></label><label className="mu-field">{t('paymentReference')}<input name="externalReference" minLength={8} maxLength={128} required /></label>{detailsField}<label className="flex items-start gap-3 text-sm"><input name="moneyVerified" type="checkbox" required />{t('moneyVerified')}</label>{button(selected.status === 'in_custody' ? 'disbursement' : 'redemption')}</form>}
          {admin && selected.status === 'active' && selected.extensionRequest && <form aria-label={t('extensionDecision')} className="space-y-4" onSubmit={event => submit(event, 'extension_decision')}><label className="mu-field">{t('extensionDecision')}<select name="accepted" required defaultValue=""><option value="" disabled>{common('select')}</option><option value="yes">{t('approveExtension')}</option><option value="no">{t('rejectExtension')}</option></select></label>{detailsField}{button('extensionDecision')}</form>}
          {admin && (selected.status === 'repaid' || (!!selected.custodyAt && !selected.disbursedAt && ['quoted', 'accepted', 'contract_confirmed', 'in_custody'].includes(selected.status))) && <form aria-label={t('handback')} className="space-y-4" onSubmit={event => submit(event, 'handback')}>{detailsField}{verifyHandover}<p className="mu-note">{t('handbackNote')}</p>{button('handback')}</form>}
          {admin && selected.status === 'active' && selected.overdue && terms?.disposalAfterGrace && <form aria-label={t('dispose')} className="space-y-4" onSubmit={event => submit(event, 'dispose')}><h3 className="font-bold">{t('dispose')}</h3><label className="mu-field">{t('disposalReference')}<input name="disposalReference" maxLength={255} required /></label>{detailsField}<label className="flex items-start gap-3 text-sm"><input name="contractEligibilityVerified" type="checkbox" required />{t('eligibilityVerified')}</label><label className="flex items-start gap-3 text-sm"><input name="authorized" type="checkbox" required />{t('disposalAuthorized')}</label><p className="mu-note">{t('capNote')}</p>{button('dispose')}</form>}
          {admin && selected.status === 'disposed' && !selected.productId && <form aria-label={assetLabels('intake')} className="space-y-4" onSubmit={event => submit(event, 'intake', 'intake')}><h3 className="font-bold">{assetLabels('intake')}</h3><p className="mu-note">{assetLabels('intakeNote')}</p><Link className="inline-block underline" href="/admin/products/new">{assetLabels('createDraft')}</Link><ProductPicker value={product} onChange={setProduct} excludeIds={[]} />{detailsField}<label className="flex items-start gap-3 text-sm"><input name="actualPhotosVerified" type="checkbox" required />{assetLabels('actualPhotosVerified')}</label><button className="mu-button" disabled={busy || !product}>{assetLabels('intake')}</button></form>}
          {selected.status === 'disposed' && <PawnDisposalPanel key={`${selected.id}:${selected.version}`} row={selected} admin={admin} onUpdated={row => { setSelected(row); void load(); }} />}
          {selected.productId && <Link className="mu-button" href={admin ? `/admin/products/${selected.productId}` : `/shop/product/${selected.productId}`}>{assetLabels('listedModel')}</Link>}
          {!!selected.payments.length && <div><h3 className="font-bold">{t('payments')}</h3><ol className="mt-3 space-y-3">{selected.payments.map(payment => <li className="mu-note" key={payment.id}>{t(payment.kind)} · {formatVND(payment.amountVnd, locale)} · {new Date(payment.createdAt).toLocaleString(locale)}<p className="break-all">{payment.externalReference}</p></li>)}</ol></div>}
          <div className="border-t border-slate-200 pt-5"><h3 className="font-bold">{assetLabels('history')}</h3><ol className="mt-3 space-y-3">{selected.events.map(event => {
            const historicalTerms = (event.details.terms || event.details.acceptedTerms) as PawnTerms | undefined;
            const notes = [event.details.reason, event.details.inspection].filter((value): value is string => typeof value === 'string');
            const references = [event.details.contractReference,event.details.custodyReference,event.details.externalReference,event.details.disposalReference].filter((value): value is string => typeof value === 'string');
            return <li className="mu-note" key={event.id}><span className="font-semibold">{t('events.' + event.action)}</span> · {new Date(event.createdAt).toLocaleString(locale)} · {assetLabels('version', { version: Number(event.details.version) })}
              {Boolean(historicalTerms || notes.length > 0 || references.length > 0 || event.details.oldDueAt) && <details className="mt-2"><summary className="cursor-pointer underline">{t('historyDetails')}</summary><div className="mt-2 space-y-2">
                {historicalTerms && <><p>{t('principal')}: {formatVND(historicalTerms.principalVnd, locale)} · {t('dailyRate')}: {historicalTerms.policy.dailyRateBasisPoints / 100}% · {t('termDays')}: {historicalTerms.termDays}</p><p>{policyLabels('values.' + historicalTerms.policy.dayCount)} · {policyLabels('values.' + historicalTerms.policy.rounding)} · {policyLabels('values.' + historicalTerms.policy.interestStopEvent)}</p><p className="whitespace-pre-line">{historicalTerms.contractText}</p><p>{t(historicalTerms.disposalAfterGrace ? 'disposalAgreed' : 'disposalNotAgreed')}</p></>}
                {typeof event.details.amountVnd === 'number' && <p>{formatVND(event.details.amountVnd, locale)}</p>}
                {notes.map((note,index) => <p className="whitespace-pre-line" key={index}>{note}</p>)}
                {references.map((reference,index) => <p className="break-all" key={index}>{reference}</p>)}
                {typeof event.details.oldDueAt === 'string' && typeof event.details.newDueAt === 'string' && <p>{new Date(event.details.oldDueAt).toLocaleString(locale)} → {new Date(event.details.newDueAt).toLocaleString(locale)}</p>}
              </div></details>}
            </li>;
          })}</ol></div>
        </div>}
      </div>
    </>}
  </section>;
}
