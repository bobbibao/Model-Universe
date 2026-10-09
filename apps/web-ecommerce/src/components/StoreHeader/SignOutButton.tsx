'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLogout } from '@/shared/client/hooks/useLogout';

export default function SignOutButton({ className = '' }: { className?: string }) {
  const t = useTranslations('nav');
  const { logout } = useLogout();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      setFailed(!await logout());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return <div className={`studio-signout ${className}`}>
    <button type="button" disabled={busy} onClick={signOut}>{t(busy ? 'signingOut' : 'logout')}</button>
    {failed && <span role="alert">{t('logoutFailed')}</span>}
  </div>;
}
