'use client';

import { useEffect, useState } from 'react';
import Link from '@/i18n/navigation';
import { countPendingReviews } from '@/core/client/api/AgentInboxApi';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';

const POLL_MS = 60_000;

// Header badge: how many agent proposals wait for a decision (polled every minute).
const AgentInboxBadge = () => {
  const [count, setCount] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const { user } = useCurrentUser();
  const userId = user?.id,
    role = user?.role;
  const t = useTranslations('adminNavigation');

  useEffect(() => {
    let active = true;
    setCount(null);
    setChecked(false);
    const refresh = async () => {
      if (!userId || role !== 'ADMIN' || document.visibilityState !== 'visible') return;
      const pending = await countPendingReviews(userId);
      if (active) {
        setCount(pending);
        setChecked(true);
      }
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId, role]);

  if (!userId || role !== 'ADMIN') return null;
  return (
    <Link
      href="/admin/agent/inbox"
      title={checked && count === null ? t('agentUnavailable') : t('agentPending')}
      className="relative flex h-8.5 items-center rounded-full border border-stroke bg-gray px-3 text-sm font-medium text-black dark:border-strokedark dark:bg-meta-4 dark:text-bodydark"
    >
      Agent
      {checked && count === null && (
        <span className="ml-2 text-xs text-body dark:text-bodydark">{t('agentOffline')}</span>
      )}
      {count !== null && count > 0 && (
        <span
          className="ml-2 rounded-full bg-warning px-2 text-xs font-semibold text-black"
          aria-label={t('agentPending')}
        >
          {count >= 50 ? '50+' : count}
        </span>
      )}
    </Link>
  );
};

export default AgentInboxBadge;
