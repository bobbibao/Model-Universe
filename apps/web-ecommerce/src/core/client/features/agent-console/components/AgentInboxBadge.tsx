'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AgentServerApi from '@/core/client/api/AgentServer';

const POLL_MS = 60_000;

// Header badge: how many agent proposals wait for a decision (polled every minute).
const AgentInboxBadge = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const pending = await AgentServerApi.countPendingReviews();
      if (active) setCount(pending);
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <Link
      href="/admin/agent/inbox"
      title="Đề xuất của Agent chờ duyệt"
      className="relative flex h-8.5 items-center rounded-full border border-stroke bg-gray px-3 text-sm font-medium dark:border-strokedark dark:bg-meta-4"
    >
      Agent
      {count > 0 && (
        <span className="ml-2 rounded-full bg-warning px-2 text-xs font-semibold text-white" aria-label="chờ duyệt">
          {count}
        </span>
      )}
    </Link>
  );
};

export default AgentInboxBadge;
