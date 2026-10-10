'use client';

import '@/css/account-hub.css';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import UserApi from '@/core/client/api/User';
import AdminIcon from '@/components/Admin/AdminIcon';
import SignOutButton from '@/components/StoreHeader/SignOutButton';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';
import type { User } from '@/shared/types/user';
import type { LoyaltyOverview } from '@/shared/types/loyalty';
import FieldModal from '../components/FieldModal';
import PasswordModal from '../components/PasswordModal';

function PanelLoading() {
  const t = useTranslations('common');
  return (
    <p className="account-loading" role="status">
      {t('loading')}
    </p>
  );
}
const Membership = dynamic(() => import('../../loyalty/Membership'), { loading: PanelLoading, ssr: false });
const Orders = dynamic(() => import('./OrderHistory'), { loading: PanelLoading, ssr: false });
const Addresses = dynamic(() => import('./AddressBook'), { loading: PanelLoading, ssr: false });
const Inbox = dynamic(() => import('./CustomerInbox'), { loading: PanelLoading, ssr: false });
const sections = [
  ['overview', 'dashboard'],
  ['account', 'users'],
  ['membership', 'spark'],
  ['orders', 'orders'],
  ['addresses', 'truck'],
  ['inbox', 'megaphone'],
  ['support', 'book'],
] as const;
type Section = (typeof sections)[number][0];
type EditableField = 'lastName' | 'firstName' | 'phone' | 'address';
const fields: EditableField[] = ['lastName', 'firstName', 'phone', 'address'];

function AccountWorkspace({ user }: { user: User }) {
  const t = useTranslations('accountHub'),
    profile = useTranslations('profile'),
    loyalty = useTranslations('loyalty');
  const common = useTranslations('common'),
    locale = useLocale();
  const { setUser } = useCurrentUser();
  const assistant = useCustomerAssistant();
  const search = useSearchParams();
  const requested = search.get('section');
  const section: Section = sections.some(([key]) => key === requested) ? (requested as Section) : 'overview';
  const [visited, setVisited] = useState<Section[]>([section]);
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [overview, setOverview] = useState<LoyaltyOverview>();
  const [failed, setFailed] = useState(false);
  const loadMembership = useCallback(async () => {
    setFailed(false);
    try {
      setOverview((await Api.get('/loyalty')).data);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void loadMembership();
  }, [loadMembership]);
  useEffect(() => {
    setVisited((current) => (current.includes(section) ? current : [...current, section]));
  }, [section]);
  const fullName = `${user.lastName} ${user.firstName}`.trim();
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'MU';
  const completed = fields.filter((key) => user[key]?.trim()).length;
  const href = (key: Section) => `/user-profile?section=${key}`;
  const saveField = async (value: string) => {
    if (!editing) return false;
    const updated = await UserApi.updateProfile({ [editing]: value });
    if (updated) setUser(updated);
    return Boolean(updated);
  };

  return (
    <div className="mu-wrap account-hub">
      <header className="account-heading">
        <div>
          <p className="studio-kicker">MODEL UNIVERSE / {t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
        <Link href="/shop" className="account-shop-link">
          {t('backToShop')} <AdminIcon name="arrow" size={18} />
        </Link>
      </header>
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">
              {initials}
            </span>
            <div>
              <strong>{fullName || user.email}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <nav aria-label={profile('navigation')}>
            {sections.map(([key, icon]) => (
              <Link
                key={key}
                id={`account-nav-${key}`}
                href={href(key)}
                scroll={false}
                aria-current={section === key ? 'page' : undefined}
              >
                <AdminIcon name={icon} size={19} />
                {t(`sections.${key}`)}
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </nav>
          <div className="account-session">
            <span>
              <AdminIcon name="shield" size={16} />
              {t('sessionNote')}
            </span>
            <SignOutButton />
            {user.role === 'ADMIN' && <Link href="/admin/dashboard">{t('adminWorkspace')} ↗</Link>}
          </div>
        </aside>
        <div className="account-content">
          {(visited.includes('overview') || section === 'overview') && (
            <section hidden={section !== 'overview'} aria-labelledby="account-nav-overview" className="account-panel">
              <div className="account-overview-grid">
                <article className="account-member-card">
                  <div className="account-card-top">
                    <span>MODEL UNIVERSE</span>
                    <AdminIcon name="spark" size={26} />
                  </div>
                  <p>{t('memberPass')}</p>
                  <h2>{overview?.balances.tier.name || (failed ? t('unavailable') : common('loading'))}</h2>
                  <strong className="account-pass-name">{fullName || user.email}</strong>
                  <div className="account-card-bottom">
                    <span>{t('collectorId', { id: user.id })}</span>
                    <Link href={href('membership')} scroll={false}>
                      {t('manageMembership')} ↗
                    </Link>
                  </div>
                </article>
                <article className="account-card account-next-build">
                  <span className="account-icon">
                    <AdminIcon name="box" size={26} />
                  </span>
                  <p className="studio-kicker">{t('nextBuildEyebrow')}</p>
                  <h2>{t('nextBuildTitle')}</h2>
                  <p>{t('nextBuildIntro')}</p>
                  <Link className="studio-text-link" href="/shop#filter-q">
                    {t('findKit')} <AdminIcon name="arrow" size={18} />
                  </Link>
                </article>
              </div>
              <div className="account-stats" aria-label={t('pointsOverview')}>
                {(['available', 'lifetime', 'used', 'debt'] as const).map((key) => (
                  <article className="account-card" key={key}>
                    <span>{loyalty(key)}</span>
                    <strong>{overview ? overview.balances[key].toLocaleString(locale) : '—'}</strong>
                  </article>
                ))}
              </div>
              {failed && (
                <p role="alert" className="account-notice">
                  {t('membershipFailed')} <button onClick={() => void loadMembership()}>{common('retry')}</button>
                </p>
              )}
              {overview && !overview.active && (
                <p role="status" className="account-notice">
                  {loyalty('policyPending')}
                </p>
              )}
              {overview?.balances.nextTier && (
                <article className="account-card account-progress">
                  <div>
                    <h2>{t('nextMilestone')}</h2>
                    <p>
                      {loyalty('nextTier', {
                        tier: overview.balances.nextTier.name,
                        points: Math.max(0, overview.balances.nextTier.points - overview.balances.lifetime),
                      })}
                    </p>
                  </div>
                  <progress
                    value={overview.balances.lifetime}
                    max={overview.balances.nextTier.points}
                    aria-label={loyalty('progress')}
                  />
                  <Link href={href('membership')} scroll={false}>
                    {t('viewBenefits')} ↗
                  </Link>
                </article>
              )}
              <div className="account-section-heading">
                <h2>{t('quickActions')}</h2>
                <span>{t('quickActionsNote')}</span>
              </div>
              <div className="account-quick-grid">
                {(['orders', 'addresses', 'inbox', 'support'] as const).map((key) => (
                  <Link className="account-card account-quick-link" href={href(key)} scroll={false} key={key}>
                    <AdminIcon name={sections.find(([name]) => name === key)![1]} size={23} />
                    <strong>{t(`sections.${key}`)}</strong>
                    <span>{t(`descriptions.${key}`)}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ))}
              </div>
              <div className="account-section-heading">
                <h2>{t('collectorServices')}</h2>
                <Link href="/services">{t('allServices')} ↗</Link>
              </div>
              <div className="account-service-links">
                {[
                  ['sell', 'exchange'],
                  ['pawn', 'shield'],
                  ['reservations', 'calendar'],
                ].map(([key, icon]) => (
                  <Link href={key === 'reservations' ? '/reservations' : `/services/${key}`} key={key}>
                    <AdminIcon name={icon} size={22} />
                    <div>
                      <strong>{t(`services.${key}`)}</strong>
                      <span>{t(`serviceNotes.${key}`)}</span>
                    </div>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {(visited.includes('account') || section === 'account') && (
            <section hidden={section !== 'account'} aria-labelledby="account-nav-account" className="account-panel">
              <div className="account-section-heading">
                <div>
                  <h2>{t('accountTitle')}</h2>
                  <p>{t('accountIntro')}</p>
                </div>
                <span className="account-completion">
                  {t('completion', { count: completed, total: fields.length })}
                </span>
              </div>
              <article className="account-card account-fields">
                {fields.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEditing(key)}
                    aria-label={profile('updateField', { field: profile(key) })}
                  >
                    <span>{profile(key)}</span>
                    <strong>{user[key] || profile('unknown')}</strong>
                    <span>{t('edit')} ↗</span>
                  </button>
                ))}
                <div>
                  <span>Email</span>
                  <strong>{user.email}</strong>
                  <span>{t('emailNote')}</span>
                </div>
                <div>
                  <span>{profile('gender')}</span>
                  <strong>
                    {user.gender === 'M'
                      ? profile('male')
                      : user.gender === 'F'
                        ? profile('female')
                        : profile('unknown')}
                  </strong>
                </div>
              </article>
              <article className="account-card account-security">
                <span className="account-icon">
                  <AdminIcon name="shield" size={25} />
                </span>
                <div>
                  <h2>{t('securityTitle')}</h2>
                  <p>{t('securityIntro')}</p>
                </div>
                <button className="mu-button" onClick={() => setChangingPassword(true)}>
                  {profile('changePassword')}
                </button>
              </article>
              <article className="account-card account-signout-card">
                <div>
                  <h2>{t('sessionTitle')}</h2>
                  <p>{t('signoutNote')}</p>
                </div>
                <SignOutButton />
              </article>
            </section>
          )}
          {(['membership', 'orders', 'addresses', 'inbox'] as const).map(
            (key) =>
              (visited.includes(key) || section === key) && (
                <section
                  key={key}
                  hidden={section !== key}
                  aria-labelledby={`account-nav-${key}`}
                  className="account-panel account-embedded"
                >
                  {key === 'membership' && <Membership embedded onChange={setOverview} />}
                  {key === 'orders' && <Orders embedded />}
                  {key === 'addresses' && <Addresses embedded />}
                  {key === 'inbox' && <Inbox embedded />}
                </section>
              ),
          )}
          {(visited.includes('support') || section === 'support') && (
            <section hidden={section !== 'support'} aria-labelledby="account-nav-support" className="account-panel">
              <article className="account-support-hero">
                <span className="account-icon">
                  <AdminIcon name="spark" size={28} />
                </span>
                <p className="studio-kicker">{t('supportEyebrow')}</p>
                <h2>{t('supportTitle')}</h2>
                <p>{t('supportIntro')}</p>
                <button className="mu-button" onClick={() => assistant.open()}>
                  {t('openAssistant')} <AdminIcon name="arrow" size={18} />
                </button>
              </article>
              <div className="account-quick-grid account-support-links">
                <Link href={href('orders')} scroll={false} className="account-card">
                  <AdminIcon name="orders" />
                  <h3>{t('orderHelp')}</h3>
                  <p>{t('orderHelpIntro')}</p>
                </Link>
                <Link href="/contact" className="account-card">
                  <AdminIcon name="book" />
                  <h3>{t('contactShop')}</h3>
                  <p>{t('contactIntro')}</p>
                </Link>
              </div>
              <article className="account-card account-help">
                <h2>{t('helpTitle')}</h2>
                {['points', 'returns', 'address'].map((key) => (
                  <details key={key}>
                    <summary>{t(`help.${key}.question`)}</summary>
                    <p>{t(`help.${key}.answer`)}</p>
                  </details>
                ))}
              </article>
            </section>
          )}
        </div>
      </div>
      <FieldModal
        open={Boolean(editing)}
        label={editing ? profile(editing) : ''}
        initialValue={editing ? user[editing] || '' : ''}
        onClose={() => setEditing(null)}
        onSave={saveField}
      />
      <PasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}

export default function Profile() {
  const t = useTranslations('accountHub'),
    profile = useTranslations('profile');
  const { user, loading } = useCurrentUser();
  if (loading)
    return (
      <div className="mu-wrap account-hub">
        <PanelLoading />
      </div>
    );
  if (!user)
    return (
      <section className="mu-wrap account-hub account-guest">
        <span className="account-avatar" aria-hidden="true">
          <AdminIcon name="users" size={32} />
        </span>
        <p className="studio-kicker">MODEL UNIVERSE / {t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p>{t('guestIntro')}</p>
        <Link href="/auth/signin?redirect=/user-profile" className="mu-button">
          {profile('signIn')} <AdminIcon name="arrow" size={18} />
        </Link>
        <Link href="/contact" className="studio-text-link">
          {t('contactShop')}
        </Link>
      </section>
    );
  return <AccountWorkspace key={user.id} user={user} />;
}
