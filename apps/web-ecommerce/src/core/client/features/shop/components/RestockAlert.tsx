'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { RestockPreference } from '@/shared/types/customer-tools';

export default function RestockAlert({ productId }: { productId: number }) {
  const t = useTranslations('customerTools'), { user } = useCurrentUser();
  const [active, setActive] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true; setLoaded(false); setActive(false); setFailed(false);
    if (user) void Api.get('/notifications/restocks').then((response: { data: RestockPreference[] }) => {
      if (current) { setActive(response.data.some((row: RestockPreference) => row.productId === productId && row.active)); setLoaded(true); }
    }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [user, productId]);
  return <div className="space-y-3 rounded-lg border border-store-muted/30 p-4">
    <p className="mu-note">{t('alertNote')}</p>
    {!user ? <Link className="mu-button-secondary" href={`/auth/signin?redirect=${encodeURIComponent(`/shop/product/${productId}`)}`}>{t('signInAlert')}</Link> : <button className="mu-button-secondary" disabled={busy || (!loaded && !failed)} onClick={async () => {
      setBusy(true); try { const rows = (await Api.post(`/notifications/restocks/${productId}`, { active: !active })).data as RestockPreference[];
        setActive(rows.some(row => row.productId === productId && row.active)); setLoaded(true); setFailed(false);
      } catch { /* Never claim an unconfirmed preference. */ } finally { setBusy(false); }
    }}>{active ? t('stopAlert') : t('startAlert')}</button>}
    {active && <p role="status" className="mu-note">{t('alertActive')}</p>}
    <Link className="block underline" href="/account/notifications">{t('inbox')}</Link>
  </div>;
}
