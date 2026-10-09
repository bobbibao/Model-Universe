'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import type { PawnContract } from '@/shared/types/pawn';

export default function PawnDisposalPanel({ row, admin, onUpdated }: {
  row: PawnContract; admin: boolean; onUpdated: (row: PawnContract) => void;
}) {
  const t = useTranslations('pawnDisposal'), common = useTranslations('common'), locale = useLocale();
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [costs, setCosts] = useState<{ description: string; amountVnd: string; evidenceId: number | null; fileName: string }[]>([]);
  const [scans, setScans] = useState<{ id: number; name: string }[]>([]);
  const summary = row.disposal, statement = row.disposalStatement;
  if (!summary) return null;
  const post = async (action: string, data: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      const result = await Api.post(`${admin ? '/admin/pawn' : '/pawn'}/${row.id}/disposal/${action}`, { ...data, expectedVersion: row.version });
      onUpdated(result.data); setCosts([]); setScans([]);
    } catch {
      setFailed(true);
      try { onUpdated((await Api.get(`${admin ? '/admin/pawn' : '/pawn'}/${row.id}`)).data); } catch { /* Shared API reports the transport error. */ }
    } finally { setBusy(false); }
  };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>, costIndex?: number) => {
    const input = event.currentTarget, file = input.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('purpose', 'pawn_settlement');
      const saved = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
      if (costIndex === undefined) setScans(current => [...current, { id: saved.id, name: file.name }]);
      else setCosts(current => current.map((cost, index) => index === costIndex ? { ...cost, evidenceId: saved.id, fileName: file.name } : cost));
    } catch { setFailed(true); } finally { setBusy(false); input.value = ''; }
  };
  const submit = (event: FormEvent<HTMLFormElement>, action: string, extra: Record<string, unknown> = {}) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), data: Record<string, unknown> = { ...Object.fromEntries(form), ...extra };
    for (const key of ['amountVnd', 'orderItemId']) if (form.has(key)) data[key] = Number(form.get(key));
    for (const key of ['termsAccepted', 'costsAccepted', 'moneyVerified', 'receivingAccountVerified', 'bilateralSignatureVerified']) data[key] = form.has(key);
    void post(action, data);
  };
  const amount = (value: number) => formatVND(value, locale);
  const amountFields = ['proceedsVnd', 'costsVnd', 'principalAppliedVnd', 'interestAppliedVnd', 'remainingVnd', 'surplusVnd', 'surplusPaidVnd'] as const;
  const moneyFields = <>
    <label className="mu-field">{t('amount')}<input name="amountVnd" type="number" min="1" step="1" required /></label>
    <label className="mu-field">{t('bankReference')}<input name="externalReference" minLength={8} maxLength={128} required /></label>
    <label className="mu-field">{t('verificationDetails')}<textarea name="details" maxLength={1500} required /></label>
    <label className="flex items-start gap-3 text-sm"><input name="moneyVerified" type="checkbox" required />{t('moneyVerified')}</label>
  </>;
  return <section className="space-y-5 border-t border-slate-200 pt-6" aria-label={t('title')}>
    <h3 className="text-xl font-bold">{t('title')}</h3>
    <p className="mu-note">{t('rule')}</p>
    <dl className="grid gap-3 sm:grid-cols-2">{amountFields.map(key => <div key={key}><dt className="mu-note">{t(key)}</dt><dd className="font-semibold">{amount(summary[key])}</dd></div>)}</dl>
    {row.disposalSettledAt && <p className="mu-note">{t('interestStopped', { date: new Date(row.disposalSettledAt).toLocaleString(locale) })}</p>}
    {summary.reconciliationRequired && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-950">{t('reconciliationRequired')}</p>}
    {failed && <p role="alert" className="text-red-700">{t('failed')}</p>}
    {admin && statement?.status !== 'accepted' && <form aria-label={t('offer')} className="space-y-4" onSubmit={event => submit(event, 'offer', {
      costs: costs.map(cost => ({ description: cost.description, amountVnd: Number(cost.amountVnd), evidenceId: cost.evidenceId })),
    })}>
      <h4 className="font-bold">{t('offer')}</h4>
      <label className="mu-field">{t('sale')}<select name="orderItemId" required defaultValue=""><option value="" disabled>{common('select')}</option>{summary.sales.map(sale => <option key={sale.orderItemId} value={sale.orderItemId}>{t('saleOption', { id: sale.orderId, amount: amount(sale.netProceedsVnd) })}{sale.recorded ? ` · ${t('correction')}` : ''}</option>)}</select></label>
      {!summary.sales.length && <p className="mu-note">{t('noSales')}</p>}
      {costs.map((cost, index) => <fieldset key={index} className="space-y-3 rounded border border-slate-200 p-4">
        <legend className="text-sm font-semibold">{t('costNumber', { index: index + 1 })}</legend>
        <label className="mu-field">{t('costDescription')}<input maxLength={255} required value={cost.description} onChange={event => setCosts(current => current.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} /></label>
        <label className="mu-field">{t('costAmount')}<input type="number" min="1" step="1" required value={cost.amountVnd} onChange={event => setCosts(current => current.map((row, i) => i === index ? { ...row, amountVnd: event.target.value } : row))} /></label>
        <label className="mu-field">{t('costEvidence')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => void upload(event, index)} /></label>
        {cost.fileName && <p className="mu-note break-all">{cost.fileName}</p>}
        <button className="underline" type="button" disabled={busy} onClick={() => setCosts(current => current.filter((_, i) => i !== index))}>{t('removeCost')}</button>
      </fieldset>)}
      <button type="button" className="underline" disabled={busy || costs.length >= 12} onClick={() => setCosts(current => [...current, { description: '', amountVnd: '', evidenceId: null, fileName: '' }])}>{t('addCost')}</button>
      <label className="mu-field">{t('agreement')}<textarea name="agreementText" rows={7} maxLength={5000} required defaultValue={t('amendmentTemplate')} /></label>
      <p className="mu-note">{t('offerNote')}</p>
      <button className="mu-button" disabled={busy || !summary.sales.length || costs.some(cost => !cost.evidenceId)}>{t('offer')}</button>
    </form>}
    {statement && <div className="space-y-4 rounded border border-slate-200 p-4">
      <h4 className="font-bold">{t(statement.status === 'accepted' ? 'accepted' : 'offered')}</h4>
      <p>{t('saleOption', { id: statement.orderId, amount: amount(statement.netProceedsVnd) })}</p>
      <p className="mu-note">{t('asOf', { date: new Date(statement.asOf).toLocaleString(locale) })}</p>
      <p className="whitespace-pre-line break-words">{statement.agreementText}</p>
      {statement.costs.map(cost => <div key={cost.evidenceId}><p>{cost.description} · {amount(cost.amountVnd)}</p><a className="underline" target="_blank" rel="noreferrer" href={`/api/evidence/${cost.evidenceId}`}>{t('viewEvidence')}</a></div>)}
      <dl className="grid gap-3 sm:grid-cols-2">{(['principalAppliedVnd', 'interestAppliedVnd', 'remainingVnd', 'surplusVnd'] as const).map(key => <div key={key}><dt className="mu-note">{t(key)}</dt><dd>{amount(statement[key])}</dd></div>)}</dl>
      {statement.payoutAccount && <p className="mu-note break-words">{statement.payoutAccount.bankName} · {statement.payoutAccount.accountNumber} · {statement.payoutAccount.holderName}</p>}
      {statement.signatureEvidenceIds.map(id => <a className="block underline" target="_blank" rel="noreferrer" key={id} href={`/api/evidence/${id}`}>{t('signedAmendment')}</a>)}
      {!admin && statement.status === 'offered' && <form aria-label={t('accept')} className="space-y-4" onSubmit={event => submit(event, 'decision', { decision: 'accept', evidenceIds: scans.map(scan => scan.id) })}>
        <label className="mu-field">{t('signedAmendment')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || scans.length >= 12} onChange={event => void upload(event)} /></label>
        {scans.map(scan => <p className="mu-note break-all" key={scan.id}>{scan.name}</p>)}
        {statement.surplusVnd > 0 && <>{(['bankName', 'accountNumber', 'holderName'] as const).map(field => <label key={field} className="mu-field">{t(field)}<input name={field} maxLength={field === 'accountNumber' ? 128 : 255} required /></label>)}</>}
        <label className="flex items-start gap-3 text-sm"><input name="termsAccepted" type="checkbox" required />{t('termsAccepted')}</label>
        <label className="flex items-start gap-3 text-sm"><input name="costsAccepted" type="checkbox" required />{t('costsAccepted')}</label>
        <button className="mu-button" disabled={busy || !scans.length}>{t('accept')}</button>
      </form>}
      {!admin && <form aria-label={t('withdraw')} className="space-y-4" onSubmit={event => submit(event, 'decision', { decision: 'withdraw' })}><label className="mu-field">{t('withdrawReason')}<textarea name="details" maxLength={1500} required /></label><button className="mu-button" disabled={busy}>{t('withdraw')}</button></form>}
      {admin && statement.status === 'accepted' && <form aria-label={t('execute')} className="space-y-4" onSubmit={event => submit(event, 'execute')}>
        <label className="mu-field">{t('amendmentReference')}<input name="amendmentReference" maxLength={255} required /></label>
        <label className="flex items-start gap-3 text-sm"><input name="bilateralSignatureVerified" type="checkbox" required />{t('signaturesVerified')}</label>
        <button className="mu-button" disabled={busy}>{t('execute')}</button>
      </form>}
    </div>}
    {admin && !statement && !summary.reconciliationRequired && summary.entries.length > 0 && summary.remainingVnd > 0 && <form aria-label={t('repayment')} className="space-y-4" onSubmit={event => submit(event, 'payment', { kind: 'repayment' })}><h4 className="font-bold">{t('repayment')}</h4>{moneyFields}<button className="mu-button" disabled={busy}>{t('repayment')}</button></form>}
    {admin && !statement && !summary.reconciliationRequired && summary.surplusVnd > 0 && <form aria-label={t('surplus')} className="space-y-4" onSubmit={event => submit(event, 'payment', { kind: 'surplus' })}>
      <h4 className="font-bold">{t('surplus')}</h4>
      <p className="mu-note">{t('exactSurplus', { amount: amount(summary.surplusVnd) })}</p>
      {summary.entries.filter(entry => entry.statement?.payoutAccount).slice(-1).map(entry => <p className="mu-note break-words" key={entry.id}>{entry.statement!.payoutAccount!.bankName} · {entry.statement!.payoutAccount!.accountNumber} · {entry.statement!.payoutAccount!.holderName}</p>)}
      {moneyFields}<label className="flex items-start gap-3 text-sm"><input name="receivingAccountVerified" type="checkbox" required />{t('receivingAccountVerified')}</label><button className="mu-button" disabled={busy}>{t('surplus')}</button>
    </form>}
    {!!summary.entries.length && <div><h4 className="font-bold">{t('ledger')}</h4><ol className="mt-3 space-y-3">{summary.entries.map(entry => <li className="mu-note break-words" key={entry.id}>{t(`entry.${entry.kind}`)} · {amount(entry.amountVnd)} · {new Date(entry.createdAt).toLocaleString(locale)}{entry.externalReference && <p>{entry.externalReference}</p>}{entry.statement && <details><summary className="cursor-pointer underline">{t('viewStatement')}</summary><p className="whitespace-pre-line">{entry.statement.agreementText}</p><p>{t('saleOption', { id: entry.statement.orderId, amount: amount(entry.statement.netProceedsVnd) })}</p>{entry.statement.costs.map(cost => <p key={cost.evidenceId}>{cost.description} · {amount(cost.amountVnd)} · <a href={`/api/evidence/${cost.evidenceId}`} className="underline" target="_blank" rel="noreferrer">{t('viewEvidence')}</a></p>)}{entry.statement.signatureEvidenceIds.map(id => <a className="block underline" target="_blank" rel="noreferrer" key={id} href={`/api/evidence/${id}`}>{t('signedAmendment')}</a>)}{entry.statement.payoutAccount && <p className="break-words">{entry.statement.payoutAccount.bankName} · {entry.statement.payoutAccount.accountNumber} · {entry.statement.payoutAccount.holderName}</p>}</details>}</li>)}</ol></div>}
  </section>;
}
