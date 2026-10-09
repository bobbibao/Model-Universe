'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import type { PartnerProfile } from '@/shared/types/partner';

export default function PartnerBankReview({ profile, admin, onChange }: {
  profile: PartnerProfile; admin: boolean; onChange: (profile: PartnerProfile) => void;
}) {
  const t = useTranslations('partnerBank'), common = useTranslations('common');
  const [busy, setBusy] = useState(false), [action, setAction] = useState('request_bank_change');
  const [files, setFiles] = useState<{ id: number; originalName: string }[]>([]);
  if (!['verified', 'restricted', 'suspended'].includes(profile.status)) return null;
  const pending = profile.pendingBankChange;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      onChange((await Api.post(`/partners/application/${profile.id}/actions`, {
        action, expectedVersion: profile.version, termsAccepted: data.get('consent') === 'on',
        reason: data.get('reason'), evidenceIds: files.map(file => file.id),
        bank: Object.fromEntries(['bankName', 'bankAccount', 'accountHolder'].map(key => [key, data.get(key)])),
      })).data);
      setFiles([]);
    } catch {
      // Keep the request and evidence available for correction or a stale-version refresh.
    } finally { setBusy(false); }
  };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    setBusy(true);
    try {
      for (const file of Array.from(input.files || []).slice(0, 3 - files.length)) {
        const data = new FormData(); data.append('file', file); data.append('purpose', 'partner_bank');
        const saved = (await Api.post('/evidence', data, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
        setFiles(current => [...current, { id: saved.id, originalName: file.name }]);
      }
    } catch {
      // Earlier uploads remain valid when another upload fails.
    } finally { setBusy(false); input.value = ''; }
  };
  return <article className="mu-panel space-y-4 p-6">
    <h2 className="mu-heading text-2xl">{t('title')}</h2>
    <p className="mu-note">{t('intro')}</p>
    {pending && <div className="space-y-3 rounded-lg border border-store-muted/30 p-4" role="status">
      <strong>{t('pending')}</strong>
      <p className="mu-note break-words">{pending.bank.bankName} · {pending.bank.bankAccount} · {pending.bank.accountHolder}</p>
      <p className="mu-note break-words">{pending.reason}</p>
      {profile.bankEvidence?.map(file => <a key={file.id} className="block break-words underline" target="_blank" rel="noreferrer" href={`/api/evidence/${file.id}`}>{file.originalName}</a>)}
    </div>}
    {!admin && !pending && <form className="space-y-4" aria-label={t('form')} onSubmit={event => void submit(event)}>
      <label className="mu-field">{t('action')}<select value={action} onChange={event => setAction(event.target.value)}>
        <option value="request_bank_change">{t('change')}</option><option value="request_close">{t('close')}</option>
      </select></label>
      {action === 'request_bank_change' && <>
        <div className="grid gap-4 sm:grid-cols-2">{(['bankName', 'bankAccount', 'accountHolder'] as const).map(key => <label className="mu-field" key={key}>
          {t(key)}<input name={key} required maxLength={key === 'bankAccount' ? 50 : 500} />
        </label>)}</div>
        <label className="mu-field">{t('photos')}<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || files.length >= 3} onChange={event => void upload(event)} /></label>
        <ul>{files.map(file => <li className="flex gap-3" key={file.id}><span className="min-w-0 break-words">{file.originalName}</span><button type="button" className="underline" disabled={busy} onClick={() => setFiles(current => current.filter(item => item.id !== file.id))}>{common('remove')}</button></li>)}</ul>
      </>}
      <label className="mu-field">{t('reason')}<textarea name="reason" required maxLength={1000} /></label>
      <label className="flex items-start gap-3"><input name="consent" type="checkbox" required />{t('consent')}</label>
      <button className="mu-button" disabled={busy || (action === 'request_bank_change' && !files.length)}>{common('submit')}</button>
    </form>}
  </article>;
}
