'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { type DataTableColumn } from '@/components/Tables/DataTable';
import { inputClassName } from '@/components/FormElements/TextField';
import AdminIcon from '@/components/Admin/AdminIcon';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { PartnerProfile, PartnerQueue, PartnerQueueRow, PartnerStatus } from '@/shared/types/partner';
import PartnerBankReview from './PartnerBankReview';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 350;
const STATUSES: PartnerStatus[] = [
  'submitted',
  'changes_requested',
  'verified',
  'restricted',
  'suspended',
  'rejected',
  'closed',
];
const TONE: Record<PartnerStatus, string> = {
  submitted: 'info',
  changes_requested: 'warning',
  verified: 'success',
  restricted: 'warning',
  suspended: 'danger',
  rejected: 'danger',
  closed: 'muted',
};
// Summary cards: each one filters the queue to its statuses.
const KPIS: { key: string; statuses: PartnerStatus[]; icon: string }[] = [
  { key: 'awaiting', statuses: ['submitted'], icon: 'shield' },
  { key: 'changes', statuses: ['changes_requested'], icon: 'orders' },
  { key: 'active', statuses: ['verified'], icon: 'users' },
  { key: 'attention', statuses: ['restricted', 'suspended'], icon: 'spark' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || '?';

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  const t = useTranslations('partnerAdmin');
  return <span className={`partner-admin-badge is-${TONE[status]}`}>{t(`statuses.${status}`)}</span>;
}

// Staff seller directory: queue overview, filters, and a review drawer with the private application.
export default function AdminPartnerDirectory() {
  const t = useTranslations('partnerAdmin'),
    p = useTranslations('partner'),
    common = useTranslations('common'),
    locale = useLocale();
  const { user } = useCurrentUser();
  const [queue, setQueue] = useState<PartnerQueue>({ rows: [], count: 0, listings: {}, summary: {} });
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<PartnerStatus | ''>(''),
    [searchInput, setSearchInput] = useState(''),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PartnerProfile | null>(null),
    [opening, setOpening] = useState<number | null>(null);
  const money = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (user?.role !== 'ADMIN') return;
    setLoading(true);
    try {
      setQueue(
        (await Api.get('/admin/partners', { params: { offset, status: status || undefined, q: search || undefined } }))
          .data,
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user, offset, status, search]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: number) => {
    setOpening(id);
    try {
      setSelected((await Api.get(`/admin/partners/${id}`)).data);
    } catch {
      // The shared API reports the failure; the queue stays as it was.
    } finally {
      setOpening(null);
    }
  };
  const applyFilter = (next: PartnerStatus | '') => {
    setStatus(next);
    setOffset(0);
  };

  const columns: DataTableColumn<PartnerQueueRow>[] = [
    {
      key: 'shop',
      header: t('columns.shop'),
      className: 'min-w-[240px]',
      render: (row) => (
        <div className="partner-admin-shop">
          <span className="partner-admin-avatar" aria-hidden="true">
            {initials(row.displayName)}
          </span>
          <div className="min-w-0">
            <strong>{row.displayName}</strong>
            <span>
              #{row.id} · {t('submittedOn', { date: date(row.createdAt) })}
            </span>
          </div>
        </div>
      ),
    },
    { key: 'status', header: t('columns.status'), render: (row) => <PartnerStatusBadge status={row.status} /> },
    {
      key: 'verification',
      header: t('columns.verification'),
      render: (row) => (
        <div className="partner-admin-checks">
          <span className={row.identityVerifiedAt ? 'is-done' : ''}>
            <AdminIcon name={row.identityVerifiedAt ? 'shield' : 'close'} size={13} />
            {t('identity')}
          </span>
          <span className={row.bankVerifiedAt ? 'is-done' : row.bankChangePending ? 'is-pending' : ''}>
            <AdminIcon name={row.bankVerifiedAt ? 'shield' : 'close'} size={13} />
            {row.bankChangePending ? t('bankPending') : t('bank')}
          </span>
        </div>
      ),
    },
    {
      key: 'listings',
      header: t('columns.listings'),
      render: (row) => {
        const counts = queue.listings[row.id] || {};
        const total = Object.values(counts).reduce((sum, value) => sum + (value || 0), 0);
        if (!total) return <span className="partner-admin-muted">{t('noListings')}</span>;
        return (
          <div className="partner-admin-stack">
            <strong>
              {t('listingsApproved', { approved: (counts.approved || 0) + (counts.published || 0), total })}
            </strong>
            {!!counts.review && (
              <span className="partner-admin-review">{t('listingsInReview', { count: counts.review })}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'limits',
      header: t('columns.limits'),
      render: (row) =>
        row.maxListings === null ? (
          <span className="partner-admin-muted">{t('noLimit')}</span>
        ) : (
          <div className="partner-admin-stack">
            <strong>{t('limitCount', { count: row.maxListings })}</strong>
            <span>{t('limitValue', { value: money(row.maxListingValueVnd || 0) })}</span>
          </div>
        ),
    },
    {
      key: 'updatedAt',
      header: t('columns.updated'),
      render: (row) => <span className="partner-admin-muted">{date(row.updatedAt)}</span>,
    },
    {
      key: 'open',
      // A visually hidden header would be absolutely positioned outside the table scroller and widen the page.
      header: <span aria-label={t('columns.actions')} />,
      className: 'text-right',
      render: (row) => (
        <button
          type="button"
          className="partner-admin-open"
          disabled={opening !== null}
          aria-label={t('openLabel', { id: row.id, name: row.displayName })}
          onClick={() => void open(row.id)}
        >
          <span>{t('open')}</span>
          <span className="partner-admin-open-id">#{row.id}</span>
          <AdminIcon name="arrow" size={14} />
        </button>
      ),
    },
  ];

  const page = Math.floor(offset / PAGE_SIZE) + 1,
    totalPages = Math.max(1, Math.ceil(queue.count / PAGE_SIZE));
  return (
    <>
      <Breadcrumb pageName={t('title')} />
      <div className="partner-admin-kpis">
        {KPIS.map((kpi) => {
          const value = kpi.statuses.reduce((sum, key) => sum + (queue.summary[key] || 0), 0);
          const active = kpi.statuses.length === 1 && status === kpi.statuses[0];
          return (
            <button
              key={kpi.key}
              type="button"
              className={`partner-admin-kpi${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => applyFilter(active ? '' : kpi.statuses[0])}
            >
              <span className="partner-admin-kpi-icon">
                <AdminIcon name={kpi.icon} size={18} />
              </span>
              <strong>{value}</strong>
              <span>{t(`kpis.${kpi.key}`)}</span>
            </button>
          );
        })}
      </div>
      {failed && (
        <div className="partner-admin-alert" role="alert">
          {t('loadFailed')}
          <button type="button" onClick={() => void load()}>
            {common('retry')}
          </button>
        </div>
      )}
      <DataTable
        title={t('listTitle', { count: queue.count })}
        actions={
          <>
            <label className="sr-only" htmlFor="partner-search">
              {t('search')}
            </label>
            <input
              id="partner-search"
              type="search"
              className={`${inputClassName} !py-2 sm:w-64`}
              placeholder={t('search')}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <label className="sr-only" htmlFor="partner-status">
              {t('columns.status')}
            </label>
            <select
              id="partner-status"
              className={`${inputClassName} !py-2 sm:w-48`}
              value={status}
              onChange={(event) => applyFilter(event.target.value as PartnerStatus | '')}
            >
              <option value="">{t('allStatuses')}</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`statuses.${value}`)}
                </option>
              ))}
            </select>
          </>
        }
        columns={columns}
        data={queue.rows}
        rowKey={(row) => row.id}
        loading={loading}
        emptyText={t('empty')}
        pagination={{
          total: queue.count,
          page,
          perPage: PAGE_SIZE,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        }}
        onPageChange={(next) => setOffset((next - 1) * PAGE_SIZE)}
      />
      {selected && (
        <PartnerReviewDrawer
          profile={selected}
          onChange={(profile) => {
            setSelected(profile);
            void load();
          }}
          onClose={() => setSelected(null)}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {selected ? p(`statuses.${selected.status}`) : ''}
      </span>
    </>
  );
}

const FIELD_GROUPS = [
  { key: 'shop', fields: ['displayName', 'phone', 'pickupAddress', 'experience'] },
  { key: 'identity', fields: ['legalName', 'bankName', 'bankAccount', 'accountHolder'] },
] as const;

function PartnerReviewDrawer({
  profile,
  onChange,
  onClose,
}: {
  profile: PartnerProfile;
  onChange: (profile: PartnerProfile) => void;
  onClose: () => void;
}) {
  const t = useTranslations('partnerAdmin'),
    p = useTranslations('partner'),
    common = useTranslations('common'),
    locale = useLocale();
  const [action, setAction] = useState(''),
    [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const money = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
  const dateTime = (value: string | null) => (value ? new Date(value).toLocaleString(locale) : p('unverified'));

  useEffect(() => setAction(''), [profile.id, profile.status]);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const actions = profile.pendingBankChange
    ? ['verify_bank_change', 'reject_bank_change']
    : profile.status === 'submitted'
      ? ['request_changes', 'verify', 'reject', 'close']
      : profile.status === 'verified'
        ? ['restrict', 'suspend']
        : profile.status === 'restricted'
          ? ['restore', 'suspend']
          : profile.status === 'suspended'
            ? ['restore']
            : ['changes_requested', 'rejected'].includes(profile.status)
              ? ['close']
              : [];

  const decide = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    try {
      onChange(
        (
          await Api.post(`/admin/partners/${profile.id}/actions`, {
            action,
            expectedVersion: profile.version,
            reason: data.get('reason'),
            maxListings: Number(data.get('maxListings')),
            maxListingValueVnd: Number(data.get('maxListingValueVnd')),
            identityVerified: data.get('identityVerified') === 'on',
            bankVerified: data.get('bankVerified') === 'on',
          })
        ).data,
      );
      form.reset();
    } catch {
      // The shared API reports validation and stale-version conflicts.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="partner-admin-drawer-root">
      <button type="button" className="partner-admin-backdrop" aria-label={t('close')} onClick={onClose} />
      <div
        ref={panel}
        className="partner-admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-drawer-title"
        tabIndex={-1}
      >
        <header className="partner-admin-drawer-head">
          <div className="partner-admin-shop">
            <span className="partner-admin-avatar is-large" aria-hidden="true">
              {initials(profile.application.displayName)}
            </span>
            <div className="min-w-0">
              <h2 id="partner-drawer-title">{profile.application.displayName}</h2>
              <span>
                #{profile.id} · {t('version', { version: profile.version })}
              </span>
            </div>
          </div>
          <button type="button" className="partner-admin-icon-button" aria-label={t('close')} onClick={onClose}>
            <AdminIcon name="close" size={18} />
          </button>
        </header>
        <div className="partner-admin-drawer-body">
          <div className="partner-admin-status-line">
            <PartnerStatusBadge status={profile.status} />
            <span>{p(`statuses.${profile.status}`)}</span>
          </div>
          <p className="partner-admin-note">{p('verificationNote')}</p>

          <section className="partner-admin-facts">
            <div>
              <span>{t('identity')}</span>
              <strong>{dateTime(profile.identityVerifiedAt)}</strong>
            </div>
            <div>
              <span>{t('bank')}</span>
              <strong>{dateTime(profile.bankVerifiedAt)}</strong>
            </div>
            <div>
              <span>{t('columns.limits')}</span>
              <strong>
                {profile.maxListings === null
                  ? t('noLimit')
                  : `${t('limitCount', { count: profile.maxListings })} · ${money(profile.maxListingValueVnd || 0)}`}
              </strong>
            </div>
          </section>

          {FIELD_GROUPS.map((group) => (
            <section key={group.key} className="partner-admin-section">
              <h3>{t(`sections.${group.key}`)}</h3>
              <dl className="partner-admin-fields">
                {group.fields.map((key) => (
                  <div key={key} className={key === 'experience' || key === 'pickupAddress' ? 'is-wide' : ''}>
                    <dt>{p(`fields.${key}`)}</dt>
                    <dd>{profile.application[key]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <section className="partner-admin-section">
            <h3>{t('sections.evidence')}</h3>
            {profile.evidence?.length ? (
              <ul className="partner-admin-files">
                {profile.evidence.map((file) => (
                  <li key={file.id}>
                    <a target="_blank" rel="noreferrer" href={`/api/evidence/${file.id}`}>
                      <AdminIcon name="book" size={16} />
                      <span>{file.originalName}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="partner-admin-muted">{t('noEvidence')}</p>
            )}
          </section>

          <section className="partner-admin-section">
            <h3>{t('sections.review')}</h3>
            {actions.length ? (
              <form
                key={profile.version}
                onSubmit={(event) => void decide(event)}
                className="space-y-4"
                aria-label={p('reviewForm')}
              >
                <label className="mu-field">
                  {p('action')}
                  <select
                    value={actions.includes(action) ? action : ''}
                    onChange={(event) => setAction(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      {p('choose')}
                    </option>
                    {actions.map((value) => (
                      <option key={value} value={value}>
                        {p(`actions.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {['verify', 'restrict', 'restore'].includes(action) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="mu-field">
                      {p('maxListings')}
                      <input
                        name="maxListings"
                        type="number"
                        step="1"
                        min="1"
                        max="1000"
                        required
                        defaultValue={profile.maxListings || ''}
                      />
                    </label>
                    <label className="mu-field">
                      {p('maxValue')}
                      <input
                        name="maxListingValueVnd"
                        type="number"
                        step="1"
                        min="1"
                        max="2147483647"
                        required
                        defaultValue={profile.maxListingValueVnd || ''}
                      />
                    </label>
                  </div>
                )}
                {['verify', 'verify_bank_change'].includes(action) && (
                  <div className="space-y-3">
                    {action === 'verify' && (
                      <label className="flex items-start gap-3">
                        <input type="checkbox" name="identityVerified" required className="mt-1" />
                        {p('identityCheck')}
                      </label>
                    )}
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name="bankVerified" required className="mt-1" />
                      {p('bankCheck')}
                    </label>
                  </div>
                )}
                <label className="mu-field">
                  {p('reason')}
                  <textarea name="reason" maxLength={1000} required rows={3} />
                </label>
                <button className="mu-button" disabled={busy}>
                  {common('submit')}
                </button>
              </form>
            ) : (
              <p className="partner-admin-muted">{t('noActions')}</p>
            )}
          </section>

          <PartnerBankReview key={profile.id} profile={profile} admin onChange={onChange} />

          <section className="partner-admin-section">
            <h3>{p('history')}</h3>
            <ol className="partner-admin-timeline">
              {[...(profile.events || [])].reverse().map((event) => (
                <li key={event.id}>
                  <strong>{p(`events.${event.action}`)}</strong>
                  <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString(locale)}</time>
                  {typeof event.details.reason === 'string' && <p>{event.details.reason}</p>}
                </li>
              ))}
            </ol>
          </section>

          {['verified', 'restricted', 'suspended'].includes(profile.status) && (
            <Link className="partner-admin-link" href="/admin/partner-listings">
              {t('viewListings')}
              <AdminIcon name="arrow" size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
