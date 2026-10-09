'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import ProductPicker, { type PickedProduct } from '@/core/client/features/inventory/components/ProductPicker';
import { SUPPORT_OUTCOMES, type SupportOutcome } from '@/shared/return-rules';
import type { SupportCase } from '@/shared/types/support';
import { formatVND } from '@/shared/server/utils/utils';
import ProductImage from '@/components/ProductImage';

export default function SupportResolution({ id, admin = false }: { id: number; admin?: boolean }) {
  const t = useTranslations('supportResolution'),
    catalog = useTranslations('catalog'),
    common = useTranslations('common'),
    returns = useTranslations('returns'),
    locale = useLocale();
  const [value, setValue] = useState<SupportCase>(),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [outcome, setOutcome] = useState<SupportOutcome>('parts'),
    [product, setProduct] = useState<PickedProduct | null>(null);
  const endpoint = admin ? `/admin/returns/${id}/resolution` : `/returns/${id}`;
  const load = useCallback(async () => {
    try {
      const response = await Api.get(endpoint);
      setValue(response.data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [endpoint]);
  useEffect(() => {
    setValue(undefined);
    void load();
  }, [load]);
  const post = async (path: string, data: Record<string, unknown>) => {
    setBusy(true);
    try {
      setValue((await Api.post(path, { ...data, expectedVersion: value?.resolutionVersion })).data);
    } catch {
      /* Shared API reports failed validation; refresh a possibly superseded offer. */ await load();
    } finally {
      setBusy(false);
    }
  };
  const offer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post(endpoint, {
      outcome,
      details: form.get('details'),
      refundVnd: Number(form.get('refundVnd')),
      productId: product?.id,
      quantity: Number(form.get('quantity')),
    });
  };
  const fulfill = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post(`${endpoint}/fulfill`, {
      externalReference: form.get('externalReference'),
      details: form.get('details'),
      moneyVerified: form.has('moneyVerified'),
      handoverVerified: form.has('handoverVerified'),
    });
  };
  if (failed && !value)
    return (
      <button className="mu-button mu-button-secondary" onClick={() => void load()}>
        {common('retry')}
      </button>
    );
  if (!value)
    return (
      <p role="status" className="mu-note">
        {common('loading')}
      </p>
    );
  const terms = value.resolutionTerms,
    monetary = !['parts', 'exchange', 'repair'].includes(outcome);
  return (
    <section className="mt-5 space-y-4 border-t border-slate-200 pt-5">
      <h3 className="text-xl font-bold">{t('title')}</h3>
      <p role="status" className="mu-note">
        {t(`state.${value.resolutionStatus || 'pending'}`)}
      </p>
      {terms ? (
        <div className="mu-panel p-4">
          <p className="mu-eyebrow">{t('version', { version: value.resolutionVersion })}</p>
          <h4 className="mt-2 font-bold">{t(`outcomes.${terms.outcome}`)}</h4>
          <p className="mt-2 whitespace-pre-line">{terms.details}</p>
          {terms.refundVnd > 0 && <p className="mt-3 font-bold">{formatVND(terms.refundVnd, locale)}</p>}
          {terms.replacement && (
            <div className="mt-4 flex gap-3">
              <div className="relative h-20 w-20 shrink-0">
                <ProductImage src={terms.replacement.imageUrl} alt={terms.replacement.name} sizes="80px" />
              </div>
              <div>
                <p className="mu-note">
                  {terms.replacement.name} · {terms.replacement.sku} · {terms.replacement.quantity} ·{' '}
                  {terms.replacement.grade} {terms.replacement.scale} ·{' '}
                  {catalog(terms.replacement.condition === 'preowned' ? 'preowned' : 'new')}
                </p>
                <p className="mu-note">
                  {catalog('assembly')}: {catalog(terms.replacement.assemblyState)}
                </p>
                <p className="mu-note">
                  {catalog('accessories')}: {terms.replacement.includedAccessories.join(', ') || '—'}
                </p>
                <p className="mu-note">
                  {catalog('defects')}: {terms.replacement.defects.join(', ') || '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mu-note">{t('pending')}</p>
      )}
      {!admin && value.resolutionStatus === 'offered' && (
        <div className="space-y-3">
          <p className="mu-note">{t('acceptNote')}</p>
          <div className="flex flex-wrap gap-3">
            <button
              className="mu-button"
              disabled={busy}
              onClick={() => void post(`/returns/${id}/decision`, { decision: 'accepted' })}
            >
              {t('accept')}
            </button>
            <button
              className="mu-button mu-button-secondary"
              disabled={busy}
              onClick={() => void post(`/returns/${id}/decision`, { decision: 'rejected' })}
            >
              {t('reject')}
            </button>
          </div>
        </div>
      )}
      {admin && value.status !== 'REJECTED' && !['accepted', 'resolved'].includes(value.resolutionStatus || '') && (
        <form className="space-y-3" onSubmit={offer}>
          <h4 className="font-bold">{t('offer')}</h4>
          <label className="mu-field">
            {t('outcome')}
            <select value={outcome} onChange={(event) => setOutcome(event.target.value as SupportOutcome)}>
              {SUPPORT_OUTCOMES.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`outcomes.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="mu-field">
            {t('details')}
            <textarea name="details" maxLength={1000} required />
          </label>
          {monetary && (
            <label className="mu-field">
              {t('refund')}
              <input name="refundVnd" type="number" min="1" step="1" required />
            </label>
          )}
          {['parts', 'exchange'].includes(outcome) && (
            <>
              <div className="mu-field">
                <span>{t('product')}</span>
                <ProductPicker value={product} onChange={setProduct} excludeIds={[]} />
              </div>
              <label className="mu-field">
                {t('quantity')}
                <input name="quantity" type="number" min="1" max="999" step="1" defaultValue={1} required />
              </label>
            </>
          )}
          <button className="mu-button" disabled={busy || (['parts', 'exchange'].includes(outcome) && !product)}>
            {t('offer')}
          </button>
        </form>
      )}
      {admin && value.resolutionStatus === 'accepted' && terms && (
        <form onSubmit={fulfill} className="space-y-3">
          <h4 className="font-bold">{t('fulfill')}</h4>
          <label className="mu-field">
            {t('reference')}
            <input name="externalReference" minLength={8} maxLength={128} required />
          </label>
          <label className="mu-field">
            {t('details')}
            <textarea name="details" maxLength={1000} required />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              name={terms.refundVnd > 0 ? 'moneyVerified' : 'handoverVerified'}
              required
            />
            {t(terms.refundVnd > 0 ? 'moneyVerified' : 'handoverVerified')}
          </label>
          <button className="mu-button" disabled={busy}>
            {t('fulfill')}
          </button>
        </form>
      )}
      {admin && !!value.evidence?.length && (
        <div>
          <h4 className="font-bold">{returns('evidence')}</h4>
          {value.evidence.map((file) => (
            <a
              className="mu-note block underline"
              key={file.id}
              href={`/api/evidence/${file.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {file.originalName}
            </a>
          ))}
        </div>
      )}
      {!!value.events?.length && (
        <div>
          <h4 className="font-bold">{t('history')}</h4>
          <ol className="mt-3 space-y-2">
            {value.events.map((event) => (
              <li key={event.id} className="mu-note">
                {t(`events.${event.action}`)} · {new Date(event.createdAt).toLocaleString(locale)} ·{' '}
                {t('version', { version: Number(event.details.version) })}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
