'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import CiApi from '@/core/client/api/Ci';
import type { CiNotificationList } from '@/shared/types/ci';
import { formatDateTime } from './ciLabels';

// Notifications the agent sent to the signed-in admin (questions, executed actions, results).
const NotificationPanel = () => {
  const [list, setList] = useState<CiNotificationList>();

  const load = useCallback(async () => setList(await CiApi.getNotifications()), []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async () => {
    if (await CiApi.markNotificationsRead()) load();
  };

  return (
    <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-black dark:text-white">
          Thông báo {list && list.unread > 0 && <span className="text-danger">({list.unread} chưa đọc)</span>}
        </h3>
        {list && list.unread > 0 && (
          <button onClick={markRead} className="text-sm font-medium text-brand-hover hover:underline">
            Đánh dấu đã đọc
          </button>
        )}
      </div>
      {!list || list.items.length === 0 ? (
        <p className="text-sm text-body">Chưa có thông báo nào.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-stroke dark:divide-strokedark">
          {list.items.map((item) => (
            <li key={item.id} className="py-3">
              <Link
                href={`/admin/ci/improvements/${encodeURIComponent(item.improvementId)}`}
                className={`block font-medium hover:text-brand-hover ${item.readAt ? 'text-body' : 'text-black dark:text-white'}`}
              >
                {item.title}
              </Link>
              <span className="text-xs text-body">{formatDateTime(item.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NotificationPanel;
