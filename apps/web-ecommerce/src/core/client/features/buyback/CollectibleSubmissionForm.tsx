'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { ASSEMBLY_STATES } from '@/shared/gunpla';

export const COLLECTIBLE_ASSET_FIELDS = ['name', 'modelCode', 'version', 'assemblyState', 'boxCondition', 'accessories', 'defects', 'repairHistory'] as const;

// Buyback and pawn both start with the same private, actual-item condition evidence.
export default function CollectibleSubmissionForm({ purpose, onCreated }: { purpose: 'buyback' | 'pawn'; onCreated: (id: number) => Promise<void> }) {
  const t = useTranslations('buyback'), common = useTranslations('common'), catalog = useTranslations('catalog');
  const [evidence, setEvidence] = useState<{ id: number; name: string }[]>([]), [progress, setProgress] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef<{ digest: string; key: string }>();
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target, files = Array.from(input.files || []).slice(0, 12 - evidence.length);
    setBusy(true);
    try {
      for (let index = 0; index < files.length; index++) {
        setProgress(t('uploadProgress', { current: index + 1, total: files.length }));
        const form = new FormData(); form.append('file', files[index]); form.append('purpose', purpose);
        const file = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
        setEvidence(current => [...current, { id: file.id, name: files[index].name }]);
      }
    } catch { /* Preserve successful uploads for a validated retry. */ }
    finally { setBusy(false); setProgress(''); input.value = ''; }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), data = { asset: Object.fromEntries(COLLECTIBLE_ASSET_FIELDS.map(key => [key, form.get(key)])), evidenceIds: evidence.map(file => file.id) };
    const digest = JSON.stringify(data);
    if (pending.current?.digest !== digest) pending.current = { digest, key: crypto.randomUUID() };
    setBusy(true);
    try { const saved = (await Api.post(`/${purpose}`, { ...data, requestKey: pending.current.key })).data; await onCreated(saved.id); }
    catch { /* Preserve the exact submission key after an uncertain response. */ }
    finally { setBusy(false); }
  };
  return <form onSubmit={event => void submit(event)} className="mu-panel mb-8 space-y-5 p-6">
    <div className="grid gap-4 md:grid-cols-2">{COLLECTIBLE_ASSET_FIELDS.map(key => <label className="mu-field" key={key}>{t(`asset.${key}`)}
      {key === 'assemblyState' ? <select name={key} required>{ASSEMBLY_STATES.map(state => <option key={state} value={state}>{catalog(state)}</option>)}</select> : ['accessories', 'defects', 'repairHistory'].includes(key) ? <textarea name={key} maxLength={1500} required /> : <input name={key} maxLength={key === 'name' ? 255 : 1500} required />}
    </label>)}</div>
    <label className="mu-field">{t('photos')}<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || evidence.length >= 12} onChange={event => void upload(event)} /></label>
    <p className="mu-note">{t('photoNote')}</p>
    {progress && <p role="status" className="mu-note">{progress}</p>}
    <ul className="space-y-2">{evidence.map(file => <li className="flex items-center justify-between gap-3 text-sm" key={file.id}><span className="break-all">{file.name}</span><button type="button" className="underline" disabled={busy} aria-label={`${t('removePhoto')} ${file.name}`} onClick={() => setEvidence(current => current.filter(item => item.id !== file.id))}>{t('removePhoto')}</button></li>)}</ul>
    <button className="mu-button" disabled={busy || evidence.length < 3}>{common('submit')}</button>
  </form>;
}
