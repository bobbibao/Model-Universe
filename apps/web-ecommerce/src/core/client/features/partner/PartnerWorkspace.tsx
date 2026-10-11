'use client';
import { ServiceHeader, ServiceTerms } from '@/components/Services/ServiceExperience';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { PartnerApplication, PartnerProfile } from '@/shared/types/partner';
import PartnerBankReview from './PartnerBankReview';

const FIELDS: (keyof PartnerApplication)[] = [
  'legalName',
  'displayName',
  'phone',
  'pickupAddress',
  'experience',
  'bankName',
  'bankAccount',
  'accountHolder',
];
// The seller's own application. Staff review lives in AdminPartnerDirectory.
export default function PartnerWorkspace() {
  const t = useTranslations('partner'),
    common = useTranslations('common'),
    locale = useLocale();
  const { user } = useCurrentUser();
  const [selected, setSelected] = useState<PartnerProfile | null>(null);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [photos, setPhotos] = useState<{ id: number; originalName: string }[]>([]);
  const pending = useRef<{ digest: string; key: string } | undefined>(undefined);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const row = ((await Api.get('/partners/application')).data || null) as PartnerProfile | null;
      setSelected(row);
      setPhotos(row?.evidence || []);
      setFailed(false);
      setLoaded(true);
    } catch {
      setFailed(true);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    setBusy(true);
    try {
      for (const file of Array.from(input.files || []).slice(0, 3 - photos.length)) {
        const form = new FormData();
        form.append('file', file);
        form.append('purpose', 'partner_verification');
        const saved = (await Api.post('/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
        setPhotos((current) => [...current, { id: saved.id, originalName: file.name }]);
      }
    } catch {
      // Keep successful uploads available for a retry.
    } finally {
      setBusy(false);
      input.value = '';
    }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      application: Object.fromEntries(FIELDS.map((key) => [key, data.get(key)])),
      evidenceIds: photos.map((file) => file.id),
      termsAccepted: data.get('termsAccepted') === 'on',
    };
    const digest = JSON.stringify(body);
    if (pending.current?.digest !== digest) pending.current = { digest, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const row = (
        await Api.post(
          selected ? `/partners/application/${selected.id}/actions` : '/partners/application',
          selected
            ? { ...body, action: 'revise', expectedVersion: selected.version }
            : { ...body, requestKey: pending.current.key },
        )
      ).data as PartnerProfile;
      setSelected(row);
      setPhotos(row.evidence || []);
    } catch {
      // Preserve the exact request identity after an uncertain submission response.
    } finally {
      setBusy(false);
    }
  };
  if (!user)
    return (
      <section className="mu-wrap mu-section service-workspace">
        <ServiceHeader service="partner" title={t('title')} />
        <ServiceTerms><p>{t('intro')}</p></ServiceTerms>
        <Link className="mu-button" href="/auth/signin?redirect=%2Fservices%2Fpartner">
          {common('signIn')}
        </Link>
      </section>
    );
  const canRevise = (!selected || ['submitted', 'changes_requested', 'rejected'].includes(selected.status));
  return (
    <section className="mu-wrap mu-section service-workspace">
      <ServiceHeader service="partner" title={t('title')} />
      <ServiceTerms><p>{t('intro')}</p></ServiceTerms>
      {failed && (
        <button className="mu-button mt-5" onClick={() => void load()}>
          {common('retry')}
        </button>
      )}
      {!loaded && !failed && (
        <p className="mu-note mt-5" role="status">
          {common('loading')}
        </p>
      )}
      <div className="mt-8 grid gap-6">
        <div className="min-w-0 space-y-6">
          {selected && (
            <article className="mu-panel p-6">
              <p className="mu-eyebrow">
                #{selected.id} · {t(`statuses.${selected.status}`)}
              </p>
              <h2 className="mu-heading mt-2 text-2xl">{selected.application.displayName}</h2>
              <p className="mu-note mt-3">{t('verificationNote')}</p>
              {['verified','restricted'].includes(selected.status) && <Link className="mu-button mt-4" href="/partner/inventory">{t('inventory')}</Link>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {FIELDS.map((key) => (
                  <div key={key}>
                    <p className="text-sm font-semibold">{t(`fields.${key}`)}</p>
                    <p className="mu-note break-words">{selected.application[key]}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {selected.evidence?.map((file) => (
                  <a
                    key={file.id}
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/evidence/${file.id}`}
                  >
                    {file.originalName}
                  </a>
                ))}
              </div>
              <p className="mu-note mt-4">
                {t('verifiedIdentity', {
                  date: selected.identityVerifiedAt
                    ? new Date(selected.identityVerifiedAt).toLocaleString(locale)
                    : t('unverified'),
                })}
              </p>
              <p className="mu-note">
                {t('verifiedBank', {
                  date: selected.bankVerifiedAt
                    ? new Date(selected.bankVerifiedAt).toLocaleString(locale)
                    : t('unverified'),
                })}
              </p>
              {selected.maxListings !== null && (
                <p className="mu-note">
                  {t('limits', {
                    count: selected.maxListings,
                    value: new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' }).format(
                      selected.maxListingValueVnd || 0,
                    ),
                  })}
                </p>
              )}
            </article>
          )}
          {canRevise && loaded && (
            <form
              key={selected?.version || 'new'}
              onSubmit={(event) => void submit(event)}
              className="mu-panel space-y-5 p-6"
              aria-label={t('applicationForm')}
            >
              <h2 className="mu-heading text-2xl">{selected ? t('revise') : t('apply')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {FIELDS.map((key) => (
                  <label className="mu-field" key={key}>
                    {t(`fields.${key}`)}
                    {key === 'experience' ? (
                      <textarea name={key} maxLength={1500} required defaultValue={selected?.application[key] || ''} />
                    ) : (
                      <input
                        name={key}
                        maxLength={key === 'phone' ? 20 : key === 'bankAccount' ? 50 : 500}
                        required
                        defaultValue={selected?.application[key] || ''}
                      />
                    )}
                  </label>
                ))}
              </div>
              <label className="mu-field">
                {t('identityPhotos')}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || photos.length >= 3}
                  onChange={(event) => void upload(event)}
                />
              </label>
              <p className="mu-note">{t('privateNote')}</p>
              <ul>
                {photos.map((file) => (
                  <li key={file.id} className="flex justify-between gap-3">
                    <span className="break-all">{file.originalName}</span>
                    <button
                      type="button"
                      className="underline"
                      disabled={busy}
                      onClick={() => setPhotos((current) => current.filter((photo) => photo.id !== file.id))}
                    >
                      {common('remove')}
                    </button>
                  </li>
                ))}
              </ul>
              <label className="flex gap-3">
                <input type="checkbox" name="termsAccepted" required />
                {t('consent')}
              </label>
              <button className="mu-button" disabled={busy || !photos.length}>
                {common('submit')}
              </button>
            </form>
          )}
          {selected && <PartnerBankReview key={selected.id} profile={selected} admin={false} onChange={setSelected} />}
          {selected && (
            <article className="mu-panel p-6">
              <h2 className="mu-heading text-2xl">{t('history')}</h2>
              {selected.events?.map((event) => (
                <div key={event.id} className="mt-5 border-l border-store-muted/30 pl-4">
                  <strong>{t(`events.${event.action}`)}</strong>
                  <p className="mu-note">{new Date(event.createdAt).toLocaleString(locale)}</p>
                  {typeof event.details.reason === 'string' && <p className="mu-note mt-2">{event.details.reason}</p>}
                </div>
              ))}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
