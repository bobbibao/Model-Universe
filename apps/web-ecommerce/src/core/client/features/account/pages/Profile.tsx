'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import UserApi from '@/core/client/api/User';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import FieldModal from '../components/FieldModal';
import PasswordModal from '../components/PasswordModal';

type EditableField = 'lastName' | 'firstName' | 'phone' | 'address';

const Row = ({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) => {
  const content = (
    <>
      <span className="w-28 shrink-0 text-body dark:text-store-muted sm:w-40">{label}</span>
      <span className="min-w-0 flex-1 break-words font-medium text-black dark:text-white">{value}</span>
      {onClick && <span className="text-xl text-body dark:text-store-muted">›</span>}
    </>
  );
  const className = 'flex w-full items-center gap-4 border-b border-stroke px-4 py-4 text-left dark:border-store-card';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:bg-gray-2 dark:hover:bg-store-card`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};

const Profile = () => {
  const t = useTranslations('profile'), tools = useTranslations('customerTools');
  const editableFields = (['lastName', 'firstName', 'phone', 'address'] as const).map(key => ({ key, label: t(key) }));
  const { user, loading, setUser } = useCurrentUser();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4">{t('signInNote')}</p>
        <Link href="/auth/signin?redirect=/user-profile" className="font-medium text-brand-hover hover:underline">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  const editingField = editableFields.find((field) => field.key === editing);

  const saveField = async (value: string) => {
    if (!editing) return false;
    const updated = await UserApi.updateProfile({ [editing]: value });
    if (updated) setUser(updated);
    return !!updated;
  };

  return (
    <div className="mx-auto my-10 max-w-3xl px-4">
      <h1 className="mb-6 text-3xl font-bold">{t('title')}</h1>
      <nav className="mb-6 flex flex-wrap gap-4" aria-label={t('navigation')}><Link className="mu-button-secondary" href="/account/addresses">{tools('addresses')}</Link><Link className="mu-button-secondary" href="/account/notifications">{tools('inbox')}</Link><Link className="mu-button-secondary" href="/order-history">{t('orders')}</Link></nav>
      <div className="overflow-hidden rounded-md border border-stroke bg-white dark:border-store-card dark:bg-store-panel">
        {editableFields.map((field) => (
          <Row
            key={field.key}
            label={field.label}
            value={user[field.key] || t('unknown')}
            onClick={() => setEditing(field.key)}
          />
        ))}
        <Row label={t('password')} value="**********" onClick={() => setChangingPassword(true)} />
        <Row label={t('gender')} value={user.gender === 'M' ? t('male') : user.gender === 'F' ? t('female') : t('unknown')} />
        <Row label="Email" value={user.email} />
      </div>

      <FieldModal
        open={!!editingField}
        label={editingField?.label || ''}
        initialValue={(editing && user[editing]) || ''}
        onClose={() => setEditing(null)}
        onSave={saveField}
      />
      <PasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
};

export default Profile;
