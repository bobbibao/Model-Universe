'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import ProductApi from '@/core/client/api/Product';
import { ASSEMBLY_STATES } from '@/shared/gunpla';
import { formatVND } from '@/shared/server/utils/utils';
import { BUYBACK_ISSUE_TYPES, DEDUCTION_PER_ISSUE_VND, MAX_ISSUE_QUANTITY, type BuybackEstimate, type BuybackIssue } from '@/shared/buyback-pricing';
import type { ProductSummary } from '@/shared/types/product';
import { COLLECTIBLE_ASSET_FIELDS } from './CollectibleSubmissionForm';

const CONFIRMATIONS = ['honest', 'issues', 'media', 'estimate', 'inspection', 'decision'] as const;
const MAX_FILES = 12;

// "Sell to Model Universe" (buyback 2.0): choose the catalog model, declare its condition issue by issue, see the
// expected price (reference member price − tier deduction − 50,000 VND per issue), upload photos and a video, confirm
// the terms, send. The server recomputes the estimate and checks the media.
export default function BuybackSubmissionForm({ onCreated }: { onCreated: (id: number) => Promise<void> }) {
  const t = useTranslations('buyback'),
    v2 = useTranslations('buybackV2'),
    catalog = useTranslations('catalog'),
    common = useTranslations('common'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [reference, setReference] = useState<ProductSummary | null>(null);
  const [issues, setIssues] = useState<BuybackIssue[]>([]);
  const [seriousDamage, setSeriousDamage] = useState(false);
  const [estimate, setEstimate] = useState<BuybackEstimate>();
  const [files, setFiles] = useState<{ id: number; name: string; video: boolean }[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ digest: string; key: string } | undefined>(undefined);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void ProductApi.getProducts({ q: query.trim(), per_page: 8 }).then((page) => setResults((page?.data || []).filter((row) => !row.partnerId)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void Api.post('/buyback/estimate', { referenceProductId: reference?.id ?? null, declaredIssues: issues, seriousDamage })
        .then((response) => setEstimate(response.data.estimate))
        .catch(() => undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [reference, issues, seriousDamage]);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target,
      chosen = Array.from(input.files || []).slice(0, MAX_FILES - files.length);
    setBusy(true);
    try {
      for (let index = 0; index < chosen.length; index++) {
        setProgress(t('uploadProgress', { current: index + 1, total: chosen.length }));
        const form = new FormData();
        form.append('file', chosen[index]);
        form.append('purpose', 'buyback');
        const file = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
        setFiles((current) => [...current, { id: file.id, name: chosen[index].name, video: chosen[index].type.startsWith('video/') }]);
      }
    } catch {
      /* Successful uploads stay for a retry. */
    } finally {
      setBusy(false);
      setProgress('');
      input.value = '';
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    const form = new FormData(event.currentTarget);
    const data = {
      asset: Object.fromEntries(COLLECTIBLE_ASSET_FIELDS.map((key) => [key, form.get(key)])),
      evidenceIds: files.map((file) => file.id),
      declaredIssues: issues,
      referenceProductId: reference?.id ?? null,
      seriousDamage,
      confirmations: true,
    };
    const digest = JSON.stringify(data);
    if (pending.current?.digest !== digest) pending.current = { digest, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const saved = (await Api.post('/buyback', { ...data, requestKey: pending.current.key })).data;
      await onCreated(saved.id);
    } catch {
      /* Keep the same submission key after an uncertain response. */
    } finally {
      setBusy(false);
    }
  };

  const photos = files.filter((file) => !file.video).length,
    videos = files.length - photos;
  const ready = photos >= 3 && confirmed.length === CONFIRMATIONS.length;
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="mu-panel studio-intake mb-8 space-y-6 p-6">
      <section className="space-y-3">
        <h2 className="text-xl font-bold">{v2('step1')}</h2>
        <label className="mu-field">
          {v2('catalogSearch')}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={v2('catalogPlaceholder')} />
        </label>
        {reference ? (
          <p className="text-sm">
            {v2('catalogChosen', { name: reference.name, price: money(reference.price) })}{' '}
            <button type="button" className="underline" onClick={() => setReference(null)}>
              {v2('catalogClear')}
            </button>
          </p>
        ) : (
          <p className="mu-note">{v2('catalogHint')}</p>
        )}
        {!reference && results.length > 0 && (
          <ul className="space-y-1 text-sm">
            {results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setReference(row);
                    setQuery('');
                  }}
                >
                  {row.name} · {money(row.price)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {COLLECTIBLE_ASSET_FIELDS.map((key) => (
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
                <input name={key} maxLength={key === 'name' ? 255 : 1500} required defaultValue={key === 'name' ? reference?.name : undefined} key={`${key}-${reference?.id ?? 0}`} />
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{v2('step2')}</h2>
        <p className="mu-note">{v2('issuesNote', { amount: money(DEDUCTION_PER_ISSUE_VND) })}</p>
        {issues.map((issue, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_.5fr_2fr_auto]">
            <select
              aria-label={v2('issueType')}
              value={issue.type}
              onChange={(event) => setIssues(issues.map((row, at) => (at === index ? { ...row, type: event.target.value as BuybackIssue['type'] } : row)))}
            >
              {BUYBACK_ISSUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {v2(`issueTypes.${type}`)}
                </option>
              ))}
            </select>
            <input
              aria-label={v2('quantity')}
              type="number"
              min={1}
              max={MAX_ISSUE_QUANTITY}
              value={issue.quantity}
              onChange={(event) => setIssues(issues.map((row, at) => (at === index ? { ...row, quantity: Math.max(1, Math.min(MAX_ISSUE_QUANTITY, Number(event.target.value) || 1)) } : row)))}
            />
            <input
              aria-label={v2('issueDescription')}
              placeholder={v2('issueDescription')}
              maxLength={500}
              required={issue.type === 'other'}
              value={issue.description}
              onChange={(event) => setIssues(issues.map((row, at) => (at === index ? { ...row, description: event.target.value } : row)))}
            />
            <button type="button" className="underline" onClick={() => setIssues(issues.filter((_, at) => at !== index))}>
              {v2('removeIssue')}
            </button>
          </div>
        ))}
        <button type="button" className="mu-button-secondary" onClick={() => setIssues([...issues, { type: 'broken_part', quantity: 1, description: '' }])}>
          {v2('addIssue')}
        </button>
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" checked={seriousDamage} onChange={(event) => setSeriousDamage(event.target.checked)} />
          {v2('seriousDamage')}
        </label>
        {estimate && <EstimateCard estimate={estimate} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{v2('step3')}</h2>
        <label className="mu-field">
          {v2('media')}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={busy || files.length >= MAX_FILES} onChange={(event) => void upload(event)} />
        </label>
        <p className="mu-note">{v2('mediaNote')}</p>
        <p className="mu-note">{v2('mediaCount', { photos, videos })}</p>
        {progress && <p role="status" className="mu-note">{progress}</p>}
        <ul className="space-y-1 text-sm">
          {files.map((file) => (
            <li key={file.id} className="flex justify-between gap-3">
              <span className="break-all">{file.name}</span>
              <button type="button" className="underline" onClick={() => setFiles(files.filter((row) => row.id !== file.id))}>
                {t('removePhoto')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{v2('step4')}</h2>
        <p className="rounded-md border border-dashed border-brand-hover p-3 text-sm">{v2('warning')}</p>
        {CONFIRMATIONS.map((item) => (
          <label key={item} className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={confirmed.includes(item)}
              onChange={(event) => setConfirmed(event.target.checked ? [...confirmed, item] : confirmed.filter((value) => value !== item))}
            />
            {v2(`confirm.${item}`)}
          </label>
        ))}
        <button type="submit" className="mu-button" disabled={busy || !ready}>
          {common('submit')}
        </button>
      </section>
    </form>
  );
}

export function EstimateCard({ estimate }: { estimate: BuybackEstimate }) {
  const v2 = useTranslations('buybackV2'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  return (
    <dl className="grid gap-1 rounded-md bg-gray-2 p-4 text-sm dark:bg-store-panel sm:grid-cols-2">
      <dt>{v2('estimate.reference')}</dt>
      <dd>{estimate.referencePriceVnd !== null ? money(estimate.referencePriceVnd) : '—'}</dd>
      <dt>{v2('estimate.base')}</dt>
      <dd>{estimate.baseDeductionVnd !== null ? `−${money(estimate.baseDeductionVnd)}` : '—'}</dd>
      <dt>{v2('estimate.issues', { count: estimate.issueCount, each: money(estimate.deductionPerIssueVnd) })}</dt>
      <dd>−{money(estimate.issueDeductionVnd)}</dd>
      <dt className="font-bold">{v2('estimate.total')}</dt>
      <dd className="text-lg font-bold">{estimate.estimateVnd !== null && !estimate.manualReview ? money(estimate.estimateVnd) : v2('estimate.manual')}</dd>
      {estimate.manualReview && <dd className="mu-note sm:col-span-2">{v2(`estimate.reasons.${estimate.manualReview}`)}</dd>}
      <dd className="mu-note sm:col-span-2">{v2('estimate.note')}</dd>
    </dl>
  );
}
