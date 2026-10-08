'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import ProductImage from '@/components/ProductImage';
import PartnerGuarantee from './PartnerGuarantee';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { ASSEMBLY_STATES, GRADES } from '@/shared/gunpla';
import type { Category } from '@/shared/types/product';
import type { PartnerListing, PartnerListingSummary, PartnerProfile } from '@/shared/types/partner';

const TEXT_FIELDS = ['name', 'brandName', 'modelCode', 'scale', 'series', 'boxCondition'] as const;
export default function PartnerInventory({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('partnerListings'),
    common = useTranslations('common'),
    shop = useTranslations('catalog'),
    locale = useLocale();
  const { user } = useCurrentUser();
  const [rows, setRows] = useState<PartnerListingSummary[]>([]),
    [selected, setSelected] = useState<PartnerListing | null>(null);
  const [profile, setProfile] = useState<PartnerProfile | null>(null),
    [categories, setCategories] = useState<Category[]>([]);
  const [photos, setPhotos] = useState<PartnerListing['photos']>([]),
    [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState(0),
    [count, setCount] = useState(0),
    [publicConsent, setPublicConsent] = useState(false);
  const [guaranteeLocked, setGuaranteeLocked] = useState(true);
  const pending = useRef<{ digest: string; key: string }>();
  const prefix = admin ? '/admin/partner-listings' : '/partners/listings';
  const load = useCallback(async () => {
    if (!user || (admin && user.role !== 'ADMIN')) return;
    try {
      const result = (await Api.get(prefix, { params: { offset } })).data;
      setRows(result.rows);
      setCount(result.count);
      if (!admin) {
        setProfile((await Api.get('/partners/application')).data || null);
        setCategories((await Api.get('/categories')).data);
      }
      setLoaded(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [user, admin, prefix, offset]);
  useEffect(() => {
    void load();
  }, [load]);
  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId && innerWidth < 1024)
      document.getElementById('seller-listing-detail')?.scrollIntoView({ block: 'start' });
  }, [selectedId]);
  const open = async (id: number) => {
    setBusy(true);
    try {
      const row = (await Api.get(`${prefix}/${id}`)).data as PartnerListing;
      setGuaranteeLocked(true);
      setSelected(row);
      setPhotos(row.photos);
      setCreating(false);
    } catch {
      /* Keep existing details; the shared API reports the error. */
    } finally {
      setBusy(false);
    }
  };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('publicationConsent', String(publicConsent));
      for (const file of Array.from(input.files || []).slice(0, 10 - photos.length)) form.append('files', file);
      const saved = (
        await Api.post('/partners/listings/photos', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      ).data;
      setPhotos((current) => [...current, ...saved]);
    } catch {
      /* Preserve successful uploads for the next exact submission. */
    } finally {
      setBusy(false);
      input.value = '';
    }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, data.get(field)])),
      description: data.get('description'),
      grade: data.get('grade') || undefined,
      condition: data.get('condition'),
      assemblyState: data.get('assemblyState'),
      price: Number(data.get('price')),
      stock: Number(data.get('stock')),
      expectedStock: selected?.stock,
      categoryId: Number(data.get('categoryId')),
      dispatchDays: Number(data.get('dispatchDays')),
      includedAccessories: String(data.get('includedAccessories') || '')
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      defects: String(data.get('defects') || '')
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      photoIds: photos.map((photo) => photo.id),
      conditionConfirmed: data.get('conditionConfirmed') === 'on',
    };
    const digest = JSON.stringify(body);
    if (pending.current?.digest !== digest) pending.current = { digest, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const row = (
        await Api.post(
          selected ? `${prefix}/${selected.id}/actions` : prefix,
          selected
            ? { ...body, action: 'edit', expectedVersion: selected.listingVersion }
            : { ...body, requestKey: pending.current.key },
        )
      ).data as PartnerListing;
      setSelected(row);
      setPhotos(row.photos);
      setCreating(false);
      await load();
    } catch {
      /* Retain the request key after an uncertain response; refresh inventory before starting another request. */
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: string, data?: FormData) => {
    if (!selected) return;
    setBusy(true);
    try {
      const row = (
        await Api.post(`${prefix}/${selected.id}/actions`, {
          action,
          expectedVersion: selected.listingVersion,
          reason: data?.get('reason'),
          actualPhotosVerified: data?.get('actualPhotosVerified') === 'on',
          descriptionVerified: data?.get('descriptionVerified') === 'on',
        })
      ).data as PartnerListing;
      setSelected(row);
      setPhotos(row.photos);
      await load();
    } catch {
      /* Leave the current listing visible for a version refresh. */
    } finally {
      setBusy(false);
    }
  };
  const eligible = !admin && profile && ['verified', 'restricted'].includes(profile.status);
  const editable =
    eligible &&
    (creating ||
      (!guaranteeLocked && selected && ['draft', 'rejected', 'hidden', 'approved'].includes(selected.listingStatus)));
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' }).format(value);
  return (
    <section className="mu-wrap mu-section">
      <p className="mu-eyebrow">MODEL UNIVERSE / {t('eyebrow')}</p>
      <h1 className="mu-heading">{admin ? t('adminTitle') : t('title')}</h1>
      <p className="mu-note mt-4 max-w-3xl">{t('intro')}</p>
      {!user ? (
        <Link href="/auth/signin?redirect=%2Fpartner%2Finventory" className="mu-button mt-6">
          {common('signIn')}
        </Link>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            {eligible && (
              <button
                className="mu-button"
                disabled={busy}
                onClick={() => {
                  setCreating(true);
                  setSelected(null);
                  setPhotos([]);
                  setPublicConsent(false);
                }}
              >
                {t('create')}
              </button>
            )}
            <button
              className="mu-button-secondary"
              disabled={busy}
              onClick={() => {
                void load();
                if (selected) void open(selected.id);
              }}
            >
              {common('refresh')}
            </button>
            {!admin && (
              <Link href="/services/partner" className="mu-button-secondary">
                {t('verification')}
              </Link>
            )}
          </div>
          {failed && (
            <p className="mu-note" role="alert">
              {t('loadFailed')}
            </p>
          )}
          {!loaded && !failed && (
            <p className="mu-note" role="status">
              {common('loading')}
            </p>
          )}
          {loaded && !admin && !eligible && <p className="mu-note mt-5">{t('verificationRequired')}</p>}
          <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
            <aside className="space-y-3">
              <p className="mu-note">{t('queueCount', { count })}</p>
              {rows.map((row) => (
                <button
                  key={row.id}
                  className="mu-panel w-full p-4 text-left"
                  disabled={busy}
                  onClick={() => void open(row.id)}
                >
                  <span className="mu-eyebrow">
                    #{row.id} · <span>{t(`statuses.${row.listingStatus}`)}</span>
                  </span>
                  <strong className="mt-2 block break-words">{row.name}</strong>
                  <p className="mu-note">
                    {money(row.price)} · {t('quantity', { count: row.stock })}
                  </p>
                </button>
              ))}
              <div className="flex flex-wrap gap-3">
                <button
                  className="mu-button-secondary"
                  disabled={!offset || busy}
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
            <div id="seller-listing-detail" className="order-first min-w-0 space-y-6 scroll-mt-24 lg:order-none">
              {selected && (
                <article className="mu-panel p-6">
                  <p className="mu-eyebrow">
                    #{selected.id} · <span role="status">{t(`statuses.${selected.listingStatus}`)}</span>
                  </p>
                  <h2 className="mu-heading mt-3 break-words text-2xl">{selected.name}</h2>
                  <p className="mu-note">{selected.sku}</p>
                  <p className="mu-note">
                    {money(selected.price)} · {t('quantity', { count: selected.stock })} ·{' '}
                    {t('dispatch', { days: selected.dispatchDays })}
                  </p>
                  <p className="mu-note whitespace-pre-wrap">{selected.description}</p>
                  <p className="mu-note">{t('reviewGate')}</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(['modelCode', 'grade', 'scale', 'series', 'boxCondition'] as const).map((key) => (
                      <div key={key}>
                        <dt className="text-sm font-semibold">{t(`fields.${key}`)}</dt>
                        <dd className="mu-note break-words">{selected[key] || '—'}</dd>
                      </div>
                    ))}
                    <div>
                      <dt className="text-sm font-semibold">{t('fields.condition')}</dt>
                      <dd className="mu-note">{shop(selected.condition)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold">{t('fields.assemblyState')}</dt>
                      <dd className="mu-note">{shop(selected.assemblyState)}</dd>
                    </div>
                    {(['includedAccessories', 'defects'] as const).map((key) => (
                      <div key={key}>
                        <dt className="text-sm font-semibold">{t(`fields.${key}`)}</dt>
                        <dd className="mu-note whitespace-pre-wrap">{selected[key].join('\n') || t('noneDeclared')}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {selected.photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative block aspect-square overflow-hidden rounded-lg"
                      >
                        <ProductImage
                          src={photo.url}
                          alt={photo.originalName}
                          className="object-contain"
                          sizes="(max-width: 640px) 45vw, 220px"
                        />
                      </a>
                    ))}
                  </div>
                  {!admin && eligible && (
                    <div className="mt-5 flex flex-wrap gap-3">
                      {['draft', 'rejected'].includes(selected.listingStatus) && (
                        <button className="mu-button" disabled={busy} onClick={() => void act('submit')}>
                          {t('submitReview')}
                        </button>
                      )}
                      {selected.listingStatus !== 'hidden' && (
                        <button className="mu-button-secondary" disabled={busy} onClick={() => void act('hide')}>
                          {t('withdraw')}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )}
              {selected && (
                <PartnerGuarantee
                  key={selected.id}
                  listing={selected}
                  admin={admin}
                  onLockChange={setGuaranteeLocked}
                />
              )}
              {editable && (
                <form
                  key={creating ? 'new' : selected?.listingVersion}
                  className="mu-panel space-y-5 p-6"
                  onSubmit={(event) => void save(event)}
                  aria-label={t('listingForm')}
                >
                  <h2 className="mu-heading text-2xl">{creating ? t('create') : t('edit')}</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {TEXT_FIELDS.map((key) => (
                      <label key={key} className="mu-field">
                        {t(`fields.${key}`)}
                        <input
                          name={key}
                          required={['name', 'brandName', 'modelCode', 'boxCondition'].includes(key)}
                          maxLength={255}
                          defaultValue={selected?.[key] || ''}
                        />
                      </label>
                    ))}
                    <label className="mu-field">
                      {t('fields.categoryId')}
                      <select name="categoryId" required defaultValue={selected?.categoryId || ''}>
                        <option value="">{t('choose')}</option>
                        {categories.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mu-field">
                      {t('fields.grade')}
                      <select name="grade" defaultValue={selected?.grade || ''}>
                        <option value="">{t('notApplicable')}</option>
                        {GRADES.map((grade) => (
                          <option key={grade}>{grade}</option>
                        ))}
                      </select>
                    </label>
                    <label className="mu-field">
                      {t('fields.condition')}
                      <select name="condition" required defaultValue={selected?.condition || 'new'}>
                        <option value="new">{shop('new')}</option>
                        <option value="preowned">{shop('preowned')}</option>
                      </select>
                    </label>
                    <label className="mu-field">
                      {t('fields.assemblyState')}
                      <select name="assemblyState" required defaultValue={selected?.assemblyState || 'unassembled'}>
                        {ASSEMBLY_STATES.map((value) => (
                          <option key={value} value={value}>
                            {shop(value)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(['price', 'stock', 'dispatchDays'] as const).map((key) => (
                      <label key={key} className="mu-field">
                        {t(`fields.${key}`)}
                        <input
                          name={key}
                          type="number"
                          step="1"
                          min="1"
                          max={key === 'dispatchDays' ? 30 : key === 'stock' ? 100000 : 2147483647}
                          required
                          defaultValue={selected?.[key] || ''}
                        />
                      </label>
                    ))}
                  </div>
                  {(['description', 'includedAccessories', 'defects'] as const).map((key) => (
                    <label key={key} className="mu-field">
                      {t(`fields.${key}`)}
                      <textarea
                        name={key}
                        required={key === 'description'}
                        maxLength={5000}
                        defaultValue={
                          key === 'description' ? selected?.description || '' : selected?.[key]?.join('\n') || ''
                        }
                      />
                    </label>
                  ))}
                  <p className="mu-note">{t('photoNote')}</p>
                  <label className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={publicConsent}
                      onChange={(event) => setPublicConsent(event.target.checked)}
                    />
                    {t('photoConsent')}
                  </label>
                  <label className="mu-field">
                    {t('photos')}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={busy || !publicConsent || photos.length >= 10}
                      onChange={(event) => void upload(event)}
                    />
                  </label>
                  <ul className="space-y-2">
                    {photos.map((photo, index) => (
                      <li key={photo.id} className="flex flex-wrap items-center justify-between gap-2">
                        <a className="break-all underline" href={photo.url} target="_blank" rel="noreferrer">
                          {index + 1}. {photo.originalName}
                        </a>
                        <button
                          type="button"
                          className="underline"
                          disabled={busy}
                          onClick={() => setPhotos((current) => current.filter((row) => row.id !== photo.id))}
                        >
                          {common('remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <label className="flex gap-3">
                    <input name="conditionConfirmed" type="checkbox" required />
                    {t('conditionConsent')}
                  </label>
                  <button className="mu-button" disabled={busy || !photos.length}>
                    {t('save')}
                  </button>
                </form>
              )}
              {admin && selected && selected.listingStatus !== 'hidden' && (
                <form
                  key={selected.listingVersion}
                  className="mu-panel space-y-4 p-6"
                  aria-label={t('reviewForm')}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void act(String(data.get('action')), data);
                  }}
                >
                  <label className="mu-field">
                    {t('action')}
                    <select name="action" required defaultValue="">
                      <option value="" disabled>
                        {t('choose')}
                      </option>
                      {(selected.listingStatus === 'review' ? ['approve', 'reject', 'hide'] : ['hide']).map(
                        (action) => (
                          <option key={action} value={action}>
                            {t(`actions.${action}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {selected.listingStatus === 'review' && (
                    <>
                      <label className="flex gap-3">
                        <input name="actualPhotosVerified" type="checkbox" />
                        {t('photosVerified')}
                      </label>
                      <label className="flex gap-3">
                        <input name="descriptionVerified" type="checkbox" />
                        {t('descriptionVerified')}
                      </label>
                    </>
                  )}
                  <label className="mu-field">
                    {t('reason')}
                    <textarea name="reason" required maxLength={1000} />
                  </label>
                  <button className="mu-button" disabled={busy}>
                    {common('submit')}
                  </button>
                </form>
              )}
              {selected && (
                <article className="mu-panel p-6">
                  <h2 className="mu-heading text-2xl">{t('history')}</h2>
                  {selected.events.map((event) => (
                    <div key={event.id} className="mt-5 border-l border-store-muted/30 pl-4">
                      <strong>{t(`events.${event.action}`)}</strong>
                      <p className="mu-note">{new Date(event.createdAt).toLocaleString(locale)}</p>
                      {typeof event.details.reason === 'string' && <p className="mu-note">{event.details.reason}</p>}
                    </div>
                  ))}
                </article>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
