'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { PartnerApplication, PartnerProfile } from '@/shared/types/partner';

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
export default function PartnerWorkspace({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('partner'),
    common = useTranslations('common'),
    locale = useLocale();
  const { user } = useCurrentUser();
  const [selected, setSelected] = useState<PartnerProfile | null>(null),
    [rows, setRows] = useState<PartnerProfile[]>([]);
  const [offset, setOffset] = useState(0),
    [count, setCount] = useState(0),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [photos, setPhotos] = useState<{ id: number; originalName: string }[]>([]),
    [action, setAction] = useState('request_changes');
  const pending = useRef<{ digest: string; key: string }>();
  const selectedId = selected?.id;
  const load = useCallback(async () => {
    if (!user || (admin && user.role !== 'ADMIN')) return;
    try {
      if (admin) {
        const result = (await Api.get('/admin/partners', { params: { offset } })).data;
        setRows(result.rows);
        setCount(result.count);
      } else {
        const row = ((await Api.get('/partners/application')).data || null) as PartnerProfile | null;
        setSelected(row);
        setPhotos(row?.evidence || []);
      }
      setFailed(false);
      setLoaded(true);
    } catch {
      setFailed(true);
    }
  }, [user, admin, offset]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setAction('');
  }, [selected?.id, selected?.status]);
  useEffect(() => {
    if (selectedId && innerWidth < 1024)
      document.getElementById('partner-detail')?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [selectedId]);
  const open = async (id: number) => {
    setBusy(true);
    try {
      setSelected((await Api.get(`/admin/partners/${id}`)).data);
    } catch {
      // The shared API displays the failure; retain the selected application.
    } finally {
      setBusy(false);
    }
  };
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
  const decide = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget),
      form = event.currentTarget;
    setBusy(true);
    try {
      setSelected(
        (
          await Api.post(`/admin/partners/${selected.id}/actions`, {
            action,
            expectedVersion: selected.version,
            reason: data.get('reason'),
            maxListings: Number(data.get('maxListings')),
            maxListingValueVnd: Number(data.get('maxListingValueVnd')),
            identityVerified: data.get('identityVerified') === 'on',
            bankVerified: data.get('bankVerified') === 'on',
          })
        ).data,
      );
      await load();
      form.reset();
    } catch {
      // The shared API reports validation and stale-version conflicts.
    } finally {
      setBusy(false);
    }
  };
  if (!user)
    return (
      <section className="mu-wrap mu-section">
        <h1 className="mu-heading">{t('title')}</h1>
        <p className="mu-note my-5">{t('intro')}</p>
        <Link className="mu-button" href="/auth/signin?redirect=%2Fservices%2Fpartner">
          {common('signIn')}
        </Link>
      </section>
    );
  const canRevise = !admin && (!selected || ['submitted', 'changes_requested', 'rejected'].includes(selected.status));
  const actions = selected
    ? selected.status === 'submitted'
      ? ['request_changes', 'verify', 'reject', 'close']
      : selected.status === 'verified'
        ? ['restrict', 'suspend']
        : selected.status === 'restricted'
          ? ['restore', 'suspend']
          : selected.status === 'suspended'
            ? ['restore']
            : ['changes_requested', 'rejected'].includes(selected.status)
              ? ['close']
              : []
    : [];
  return (
    <section className="mu-wrap mu-section">
      <p className="mu-eyebrow">MODEL UNIVERSE / MARKETPLACE</p>
      <h1 className="mu-heading">{admin ? t('adminTitle') : t('title')}</h1>
      <p className="mu-note mt-4 max-w-3xl">{t('intro')}</p>
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
      <div className={`mt-8 grid gap-6 ${admin ? 'lg:grid-cols-[18rem_1fr]' : ''}`}>
        {admin && (
          <aside className="space-y-3">
            <p className="mu-note">{t('queueCount', { count })}</p>
            {rows.map((row) => (
              <button
                key={row.id}
                className="mu-panel w-full p-4 text-left"
                disabled={busy}
                onClick={() => void open(row.id)}
              >
                <strong>#{row.id}</strong>
                <p className="mu-note">{t(`statuses.${row.status}`)}</p>
              </button>
            ))}
            <div className="flex gap-3">
              <button
                className="mu-button-secondary"
                disabled={offset === 0 || busy}
                onClick={() => setOffset(Math.max(0, offset - 30))}
              >
                {common('previous')}
              </button>
              <button
                className="mu-button-secondary"
                disabled={offset + 30 >= count || busy}
                onClick={() => setOffset(offset + 30)}
              >
                {common('next')}
              </button>
            </div>
          </aside>
        )}
        <div id="partner-detail" className="order-first min-w-0 space-y-6 scroll-mt-24 lg:order-none">
          {selected && (
            <article className="mu-panel p-6">
              <p className="mu-eyebrow">
                #{selected.id} · {t(`statuses.${selected.status}`)}
              </p>
              <h2 className="mu-heading mt-2 text-2xl">{selected.application.displayName}</h2>
              <p className="mu-note mt-3">{t('verificationNote')}</p>
              {!admin && ['verified','restricted'].includes(selected.status) && <Link className="mu-button mt-4" href="/partner/inventory">{t('inventory')}</Link>}
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
          {admin && selected && actions.length > 0 && (
            <form
              key={selected.version}
              onSubmit={(event) => void decide(event)}
              className="mu-panel space-y-4 p-6"
              aria-label={t('reviewForm')}
            >
              <label className="mu-field">
                {t('action')}
                <select
                  value={actions.includes(action) ? action : ''}
                  onChange={(event) => setAction(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    {t('choose')}
                  </option>
                  {actions.map((value) => (
                    <option key={value} value={value}>
                      {t(`actions.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              {['verify', 'restrict', 'restore'].includes(action) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="mu-field">
                    {t('maxListings')}
                    <input
                      name="maxListings"
                      type="number"
                      step="1"
                      min="1"
                      max="1000"
                      required
                      defaultValue={selected.maxListings || ''}
                    />
                  </label>
                  <label className="mu-field">
                    {t('maxValue')}
                    <input
                      name="maxListingValueVnd"
                      type="number"
                      step="1"
                      min="1"
                      max="2147483647"
                      required
                      defaultValue={selected.maxListingValueVnd || ''}
                    />
                  </label>
                </div>
              )}
              {action === 'verify' && (
                <>
                  <label className="flex gap-3">
                    <input type="checkbox" name="identityVerified" required />
                    {t('identityCheck')}
                  </label>
                  <label className="flex gap-3">
                    <input type="checkbox" name="bankVerified" required />
                    {t('bankCheck')}
                  </label>
                </>
              )}
              <label className="mu-field">
                {t('reason')}
                <textarea name="reason" maxLength={1000} required />
              </label>
              <button className="mu-button" disabled={busy}>
                {common('submit')}
              </button>
            </form>
          )}
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
