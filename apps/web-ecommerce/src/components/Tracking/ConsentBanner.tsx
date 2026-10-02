'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  hasTrackingTags,
  readConsent,
  saveConsent,
  useConsent,
  useConsentSettingsRequest,
} from '@/shared/client/utils/consent';

// Cookie consent (Decree 13/2023/ND-CP): marketing tags load only after "accept"; the choice can be changed at any
// time from the footer. Shown only when a marketing tag is configured.
const ConsentBanner = () => {
  const consent = useConsent();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (consent === null) setOpen(true);
  }, [consent]);

  const reopen = useCallback(() => {
    const current = readConsent();
    setAnalytics(current?.analytics ?? false);
    setMarketing(current?.marketing ?? false);
    setCustom(true);
    setOpen(true);
  }, []);
  useConsentSettingsRequest(reopen);

  if (!hasTrackingTags || !open) return null;

  const choose = async (choice: { analytics: boolean; marketing: boolean }) => {
    setOpen(false);
    setCustom(false);
    await saveConsent(choice);
  };

  return (
    <div
      role="dialog"
      aria-label="Cài đặt cookie"
      className="fixed inset-x-0 bottom-0 z-99999 border-t border-stroke bg-white p-4 shadow-default dark:border-store-card dark:bg-store-panel"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm">
          Chúng tôi dùng cookie cần thiết để cửa hàng hoạt động. Nếu bạn đồng ý, chúng tôi dùng thêm cookie phân tích và
          quảng cáo (Meta, Google, TikTok) để đo hiệu quả quảng cáo. Bạn có thể đổi lựa chọn bất cứ lúc nào ở cuối
          trang.
        </p>
        {custom ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
              Phân tích
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
              Quảng cáo
            </label>
            <button
              onClick={() => choose({ analytics, marketing })}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              Lưu lựa chọn
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 flex-wrap gap-2 text-sm">
            <button
              onClick={() => choose({ analytics: false, marketing: false })}
              className="rounded-md border border-stroke px-4 py-2 font-medium dark:border-store-card"
            >
              Từ chối
            </button>
            <button onClick={() => setCustom(true)} className="rounded-md px-4 py-2 font-medium hover:underline">
              Tuỳ chỉnh
            </button>
            <button
              onClick={() => choose({ analytics: true, marketing: true })}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              Chấp nhận tất cả
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsentBanner;
