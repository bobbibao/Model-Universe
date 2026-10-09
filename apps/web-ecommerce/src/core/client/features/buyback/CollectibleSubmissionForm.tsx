'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { ASSEMBLY_STATES } from '@/shared/gunpla';
import AdminIcon from '@/components/Admin/AdminIcon';

export const COLLECTIBLE_ASSET_FIELDS = [
  'name',
  'modelCode',
  'version',
  'assemblyState',
  'boxCondition',
  'accessories',
  'defects',
  'repairHistory',
] as const;

// Buyback and pawn both start with the same private, actual-item condition evidence.
export default function CollectibleSubmissionForm({
  purpose,
  onCreated,
}: {
  purpose: 'buyback' | 'pawn';
  onCreated: (id: number) => Promise<void>;
}) {
  const t = useTranslations('buyback'),
    common = useTranslations('common'),
    catalog = useTranslations('catalog');
  const experience = useTranslations('experience');
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const validateStep = (index: number) => {
    const fields = Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[data-intake-step="${index}"] input, [data-intake-step="${index}"] select, [data-intake-step="${index}"] textarea`,
      ) || [],
    );
    const invalid = fields.find((field) => !field.checkValidity());
    if (!invalid) return true;
    setStep(index);
    requestAnimationFrame(() => {
      invalid.focus();
      invalid.reportValidity();
    });
    return false;
  };
  const [evidence, setEvidence] = useState<{ id: number; name: string }[]>([]),
    [progress, setProgress] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef<{ digest: string; key: string } | undefined>(undefined);
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target,
      files = Array.from(input.files || []).slice(0, 12 - evidence.length);
    setBusy(true);
    try {
      for (let index = 0; index < files.length; index++) {
        setProgress(t('uploadProgress', { current: index + 1, total: files.length }));
        const form = new FormData();
        form.append('file', files[index]);
        form.append('purpose', purpose);
        const file = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
        setEvidence((current) => [...current, { id: file.id, name: files[index].name }]);
      }
    } catch {
      /* Preserve successful uploads for a validated retry. */
    } finally {
      setBusy(false);
      setProgress('');
      input.value = '';
    }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || (step === 2 && evidence.length < 3)) return;
    if (step < 2) {
      if (validateStep(step)) setStep(step + 1);
      return;
    }
    if (!validateStep(0) || !validateStep(1)) return;
    const form = new FormData(event.currentTarget),
      data = {
        asset: Object.fromEntries(COLLECTIBLE_ASSET_FIELDS.map((key) => [key, form.get(key)])),
        evidenceIds: evidence.map((file) => file.id),
      };
    const digest = JSON.stringify(data);
    if (pending.current?.digest !== digest) pending.current = { digest, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const saved = (await Api.post(`/${purpose}`, { ...data, requestKey: pending.current.key })).data;
      await onCreated(saved.id);
    } catch {
      /* Preserve the exact submission key after an uncertain response. */
    } finally {
      setBusy(false);
    }
  };
  const assetField = (key: (typeof COLLECTIBLE_ASSET_FIELDS)[number]) => (
    <label className="mu-field" key={key}>
      {t(`asset.${key}`)}
      {key === 'assemblyState' ? (
        <select name={key} required>
          {ASSEMBLY_STATES.map((state) => (
            <option key={state} value={state}>
              {catalog(state)}
            </option>
          ))}
        </select>
      ) : ['accessories', 'defects', 'repairHistory'].includes(key) ? (
        <textarea name={key} maxLength={1500} required />
      ) : (
        <input name={key} maxLength={key === 'name' ? 255 : 1500} required />
      )}
    </label>
  );
  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="mu-panel studio-intake mb-8 space-y-5 p-6"
    >
      <ol className="studio-intake-steps">
        {['intakeIdentity', 'intakeCondition', 'intakePhotos'].map((label, index) => (
          <li key={label} aria-current={step === index ? 'step' : undefined}>
            <span>{index < step ? '✓' : index + 1}</span>
            {experience(label)}
          </li>
        ))}
      </ol>
      <div className="studio-intake-heading">
        <AdminIcon name={step === 2 ? 'box' : 'spark'} size={25} />
        <div>
          <h2>{experience(['intakeIdentity', 'intakeCondition', 'intakePhotos'][step])}</h2>
          <p>{experience(['intakeIdentityNote', 'intakeConditionNote', 'intakePhotosNote'][step])}</p>
        </div>
      </div>
      <div data-intake-step="0" hidden={step !== 0}>
        <div className="grid gap-4 md:grid-cols-2">{COLLECTIBLE_ASSET_FIELDS.slice(0, 5).map(assetField)}</div>
      </div>
      <div data-intake-step="1" hidden={step !== 1}>
        <div className="grid gap-4">{COLLECTIBLE_ASSET_FIELDS.slice(5).map(assetField)}</div>
      </div>
      <div data-intake-step="2" hidden={step !== 2}>
        <label className="mu-field">
          {t('photos')}
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || evidence.length >= 12}
            onChange={(event) => void upload(event)}
          />
        </label>
        <p className="mu-note">{t('photoNote')}</p>
        {progress && (
          <p role="status" className="mu-note">
            {progress}
          </p>
        )}
        <ul className="space-y-2">
          {evidence.map((file) => (
            <li className="flex items-center justify-between gap-3 text-sm" key={file.id}>
              <span className="break-all">{file.name}</span>
              <button
                type="button"
                className="underline"
                disabled={busy}
                aria-label={`${t('removePhoto')} ${file.name}`}
                onClick={() => setEvidence((current) => current.filter((item) => item.id !== file.id))}
              >
                {t('removePhoto')}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="studio-intake-actions">
        <span>{experience('stepPosition', { step: step + 1 })}</span>
        <div>
          {step > 0 && (
            <button type="button" className="mu-button-secondary" disabled={busy} onClick={() => setStep(step - 1)}>
              {experience('back')}
            </button>
          )}
          <button type="submit" className="mu-button" disabled={busy || (step === 2 && evidence.length < 3)}>
            {step === 2 ? common('submit') : experience('continue')}
            <AdminIcon name="arrow" size={17} />
          </button>
        </div>
      </div>
    </form>
  );
}
