'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import { formatVND } from '@/shared/server/utils/utils';
import { BUYBACK_ISSUE_TYPES, MAX_ISSUE_QUANTITY, type BuybackIssue } from '@/shared/buyback-pricing';
import type { BuybackEvidenceFile, BuybackRequest } from '@/shared/types/buyback';
import { EstimateCard } from './BuybackSubmissionForm';

type Post = (endpoint: string, data: Record<string, unknown>) => Promise<void>;

const IssueList = ({ issues }: { issues: BuybackIssue[] }) => {
  const v2 = useTranslations('buybackV2');
  if (!issues.length) return <p className="mu-note">{v2('noIssues')}</p>;
  return (
    <ul className="mu-note list-inside list-disc">
      {issues.map((issue, index) => (
        <li key={index}>
          {v2(`issueTypes.${issue.type}`)} × {issue.quantity}
          {issue.description ? ` · ${issue.description}` : ''}
        </li>
      ))}
    </ul>
  );
};

const Files = ({ files }: { files: BuybackEvidenceFile[] }) => (
  <div className="flex flex-wrap gap-3">
    {files.map((file) => (
      <a key={file.id} href={`/api/evidence/${file.id}`} target="_blank" rel="noreferrer" className="text-sm underline">
        {file.mimeType?.startsWith('video/') ? '🎬 ' : ''}
        {file.originalName}
      </a>
    ))}
  </div>
);

const uploadEvidence = async (input: HTMLInputElement, purpose: 'buyback' | 'buyback_inspection') => {
  const ids: number[] = [];
  for (const file of Array.from(input.files || []).slice(0, 12)) {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', purpose);
    ids.push((await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.id);
  }
  input.value = '';
  return ids;
};

// Buyback 2.0 details of one request: the estimate and declared issues, missing evidence, the inspection comparison
// and inspection recordings, and the 2.0 actions (request/add evidence, formula offers, inspected issues, review).
export default function BuybackPricingSections({ selected, admin, busy, post }: { selected: BuybackRequest; admin: boolean; busy: boolean; post: Post }) {
  const v2 = useTranslations('buybackV2'),
    t = useTranslations('buyback'),
    locale = useLocale();
  const money = (amount: number) => formatVND(amount, locale);
  const [inspected, setInspected] = useState<BuybackIssue[]>(selected.inspectedIssues ?? selected.declaredIssues ?? []);
  const [inspectionIds, setInspectionIds] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const comparison = selected.comparison;
  const form = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
  };
  return (
    <div className="space-y-5">
      {selected.referenceProduct && (
        <p className="mu-note">{v2('referenceProduct', { name: selected.referenceProduct.name, sku: selected.referenceProduct.sku, price: money(selected.referenceProduct.priceVnd) })}</p>
      )}
      {selected.estimate && <EstimateCard estimate={selected.estimate} />}
      <div>
        <h3 className="font-bold">{v2('declaredIssues')}</h3>
        <IssueList issues={selected.declaredIssues || []} />
      </div>
      {selected.evidenceRequest && ['need_more_evidence', 'submitted'].includes(selected.status) && (
        <p className="rounded-md border border-dashed border-brand-hover p-3 text-sm whitespace-pre-line">
          {v2('evidenceRequested')}: {selected.evidenceRequest}
        </p>
      )}
      {!admin && selected.status === 'need_more_evidence' && (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const input = event.currentTarget.querySelector<HTMLInputElement>('input[type=file]')!;
            setUploading(true);
            try {
              const ids = await uploadEvidence(input, 'buyback');
              if (ids.length) await post('actions', { action: 'add_evidence', evidenceIds: ids });
            } finally {
              setUploading(false);
            }
          }}
        >
          <label className="mu-field">
            {v2('addEvidence')}
            <input type="file" multiple required accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" />
          </label>
          <button className="mu-button" disabled={busy || uploading}>
            {v2('sendEvidence')}
          </button>
        </form>
      )}
      {admin && ['submitted', 'need_more_evidence'].includes(selected.status) && (
        <form className="space-y-3" onSubmit={(event) => void post('actions', { action: 'request_evidence', details: form(event).details })}>
          <label className="mu-field">
            {v2('requestEvidence')}
            <textarea name="details" required maxLength={1500} />
          </label>
          <button className="mu-button-secondary" disabled={busy}>
            {v2('requestEvidenceButton')}
          </button>
        </form>
      )}
      {comparison && (
        <div className="rounded-md border border-stroke p-4 text-sm dark:border-store-card">
          <h3 className="font-bold">{v2('comparison.title')}</h3>
          <p>{v2('comparison.counts', { declared: comparison.declaredIssueCount, inspected: comparison.inspectedIssueCount })}</p>
          <p>{v2('comparison.changes', { added: comparison.newIssueCount, removed: comparison.resolvedIssueCount })}</p>
          <p>{v2('comparison.difference', { amount: money(comparison.deductionDifferenceVnd) })}</p>
          <h4 className="mt-2 font-semibold">{v2('inspectedIssues')}</h4>
          <IssueList issues={selected.inspectedIssues || []} />
        </div>
      )}
      {!!selected.inspectionEvidence?.length && (
        <div>
          <h3 className="font-bold">{v2('inspectionEvidence')}</h3>
          <Files files={selected.inspectionEvidence} />
        </div>
      )}
      {selected.reviewRequest && <p className="mu-note">{v2('reviewRequested', { reason: selected.reviewRequest })}</p>}
      {!admin && selected.status === 'awaiting_acceptance' && (
        <form className="space-y-3" onSubmit={(event) => void post('actions', { action: 'request_review', details: form(event).details })}>
          <label className="mu-field">
            {v2('requestReview')}
            <textarea name="details" required maxLength={1500} />
          </label>
          <button className="mu-button-secondary" disabled={busy}>
            {v2('requestReviewButton')}
          </button>
        </form>
      )}
      {admin && ['submitted', 'quoted', 'need_more_evidence'].includes(selected.status) && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            const body = form(event);
            void post('actions', { action: 'preliminary_offer', details: body.details, ...(body.amountVnd ? { amountVnd: Number(body.amountVnd) } : {}) });
          }}
        >
          <h3 className="font-bold">{t('preliminaryOffer')}</h3>
          <label className="mu-field">
            {v2('manualAmount')}
            <input name="amountVnd" type="number" min={1} step={1} placeholder={selected.estimate?.estimateVnd ? String(selected.estimate.estimateVnd) : ''} />
          </label>
          <p className="mu-note">{v2('formulaNote')}</p>
          <label className="mu-field">
            {t('details')}
            <textarea name="details" required maxLength={1500} />
          </label>
          <button className="mu-button" disabled={busy}>
            {t('preliminaryOffer')}
          </button>
        </form>
      )}
      {admin && ['inspecting', 'awaiting_acceptance', 'reinspection_requested'].includes(selected.status) && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            const body = form(event);
            void post('actions', {
              action: 'final_offer',
              details: body.details,
              inspectedIssues: inspected,
              inspectionEvidenceIds: inspectionIds,
              seriousDamage: body.seriousDamage === 'on',
              ...(body.amountVnd ? { amountVnd: Number(body.amountVnd) } : {}),
            });
          }}
        >
          <h3 className="font-bold">{t('finalOffer')}</h3>
          <label className="mu-field">
            {v2('inspectionUpload')}
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={async (event) => {
                setUploading(true);
                try {
                  const ids = await uploadEvidence(event.target, 'buyback_inspection');
                  setInspectionIds((current) => [...current, ...ids]);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          <p className="mu-note">{v2('inspectionUploaded', { count: inspectionIds.length + (selected.inspectionEvidence?.length || 0) })}</p>
          <h4 className="font-semibold">{v2('inspectedIssues')}</h4>
          {inspected.map((issue, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_.5fr_2fr_auto]">
              <select value={issue.type} onChange={(event) => setInspected(inspected.map((row, at) => (at === index ? { ...row, type: event.target.value as BuybackIssue['type'] } : row)))}>
                {BUYBACK_ISSUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {v2(`issueTypes.${type}`)}
                  </option>
                ))}
              </select>
              <input type="number" min={1} max={MAX_ISSUE_QUANTITY} value={issue.quantity} onChange={(event) => setInspected(inspected.map((row, at) => (at === index ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row)))} />
              <input maxLength={500} placeholder={v2('issueDescription')} value={issue.description} onChange={(event) => setInspected(inspected.map((row, at) => (at === index ? { ...row, description: event.target.value } : row)))} />
              <button type="button" className="underline" onClick={() => setInspected(inspected.filter((_, at) => at !== index))}>
                {v2('removeIssue')}
              </button>
            </div>
          ))}
          <button type="button" className="mu-button-secondary" onClick={() => setInspected([...inspected, { type: 'broken_part', quantity: 1, description: '' }])}>
            {v2('addIssue')}
          </button>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" name="seriousDamage" type="checkbox" />
            {v2('seriousDamage')}
          </label>
          <label className="mu-field">
            {v2('manualAmount')}
            <input name="amountVnd" type="number" min={1} step={1} />
          </label>
          <p className="mu-note">{v2('formulaNote')}</p>
          <label className="mu-field">
            {t('details')}
            <textarea name="details" required maxLength={1500} />
          </label>
          <button className="mu-button" disabled={busy || uploading}>
            {t('finalOffer')}
          </button>
        </form>
      )}
    </div>
  );
}
