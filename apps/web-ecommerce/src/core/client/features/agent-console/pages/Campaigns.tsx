'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from '@/i18n/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import AgentMarketingApi from '@/core/client/api/AgentMarketing';
import { formatVND } from '@/shared/server/utils/utils';
import type { AgentCampaign } from '@/shared/types/agent-marketing';
import { formatDateTime } from '../components/agentLabels';

const PLATFORM_LABELS: Record<string, string> = { meta: 'Meta', google: 'Google Ads', tiktok: 'TikTok' };

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Nháp', className: 'bg-body/10 text-body' },
  active: { label: 'Đang chạy', className: 'bg-success/10 text-success' },
  paused: { label: 'Tạm dừng', className: 'bg-warning/10 text-warning' },
  ended: { label: 'Đã kết thúc', className: 'bg-body/10 text-body' },
  reverted: { label: 'Đã hoàn tác', className: 'bg-danger/10 text-danger' },
  scheduled: { label: 'Đã lên lịch', className: 'bg-meta-5/10 text-meta-5' },
  published: { label: 'Đã đăng', className: 'bg-success/10 text-success' },
  removed: { label: 'Đã gỡ', className: 'bg-body/10 text-body' },
  failed: { label: 'Lỗi', className: 'bg-danger/10 text-danger' },
};

const Status = ({ status }: { status: string }) => {
  const entry = STATUS_LABELS[status] || { label: status, className: 'bg-body/10 text-body' };
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${entry.className}`}>
      {entry.label}
    </span>
  );
};

type Pending = { kind: 'end'; campaign: AgentCampaign } | { kind: 'pause'; ref: string } | { kind: 'pause_all' };

// The agent's campaigns with their ads, posts and promotions, and the admins' protective controls: end a campaign,
// pause an ad, pause every agent ad. The agent cannot undo these; it would need a new approval to restart.
const Campaigns = () => {
  const [campaigns, setCampaigns] = useState<AgentCampaign[]>([]);
  const [activeAds, setActiveAds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await AgentMarketingApi.getCampaigns();
    setCampaigns(result?.campaigns || []);
    setActiveAds(result?.activeAds || 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async () => {
    if (!pending) return;
    const done =
      pending.kind === 'end'
        ? await AgentMarketingApi.endCampaign(pending.campaign.ref)
        : pending.kind === 'pause'
          ? await AgentMarketingApi.pauseAd(pending.ref)
          : await AgentMarketingApi.pauseAllAds();
    setPending(null);
    if (done) load();
  };

  return (
    <>
      <Breadcrumb pageName="Chiến dịch của Agent" />
      <div className="mb-6 flex flex-col gap-3 rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:flex-row sm:items-center sm:justify-between">
        <p>
          Quảng cáo đang chạy: <strong>{activeAds}</strong>
        </p>
        <button
          onClick={() => setPending({ kind: 'pause_all' })}
          disabled={activeAds === 0}
          className="rounded-md bg-danger px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Tạm dừng toàn bộ quảng cáo của Agent
        </button>
      </div>

      {loading && <p className="text-body">Đang tải...</p>}
      {!loading && campaigns.length === 0 && <p className="text-body">Agent chưa tạo chiến dịch nào.</p>}

      <div className="flex flex-col gap-6">
        {campaigns.map((campaign) => (
          <div
            key={campaign.ref}
            className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark"
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-black dark:text-white">{campaign.name || campaign.ref}</h3>
                  <Status status={campaign.status} />
                </div>
                <p className="font-mono text-xs text-body">{campaign.ref}</p>
                <p className="text-sm text-body">
                  {formatDateTime(campaign.startsAt)} – {formatDateTime(campaign.endsAt)} · Ngân sách{' '}
                  {formatVND(campaign.budgetVnd)}
                  {campaign.threadId && (
                    <>
                      {' · '}
                      <Link href={`/admin/agent/threads/${campaign.threadId}`} className="hover:underline">
                        Xem luồng
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {['active', 'draft', 'paused'].includes(campaign.status) && (
                <button
                  onClick={() => setPending({ kind: 'end', campaign })}
                  className="rounded-md border border-danger px-4 py-2 font-medium text-danger hover:bg-danger/10"
                >
                  Kết thúc chiến dịch
                </button>
              )}
            </div>

            {campaign.ads.length > 0 && (
              <div className="mb-4 overflow-x-auto">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="bg-gray-2 text-left dark:bg-meta-4">
                      <th className="px-3 py-2">Quảng cáo</th>
                      <th className="px-3 py-2">Nền tảng</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Ngân sách/ngày</th>
                      <th className="px-3 py-2">Đã chi / tổng</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.ads.map((ad) => (
                      <tr key={ad.ref} className="border-b border-stroke dark:border-strokedark">
                        <td className="px-3 py-2 font-mono text-xs">{ad.ref}</td>
                        <td className="px-3 py-2">{PLATFORM_LABELS[ad.platform] || ad.platform}</td>
                        <td className="px-3 py-2">
                          <Status status={ad.status} />
                        </td>
                        <td className="px-3 py-2">{formatVND(ad.dailyBudgetVnd)}</td>
                        <td className="px-3 py-2">
                          {formatVND(ad.spentVnd)} / {formatVND(ad.totalBudgetVnd)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {ad.status === 'active' && (
                            <button
                              onClick={() => setPending({ kind: 'pause', ref: ad.ref })}
                              className="font-medium text-danger hover:underline"
                            >
                              Tạm dừng
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold">Bài đăng Facebook</p>
                {campaign.posts.length === 0 && <p className="text-body">Không có</p>}
                {campaign.posts.map((post) => (
                  <p key={post.ref} className="flex items-center gap-2">
                    <span className="font-mono text-xs">{post.ref}</span> <Status status={post.status} />
                    <span className="text-body">{formatDateTime(post.at)}</span>
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 font-semibold">Khuyến mãi</p>
                <p className="text-body">Giảm giá sản phẩm đang chạy: {campaign.activeDiscounts}</p>
                {campaign.coupons.map((coupon) => (
                  <p key={coupon.code}>
                    <span className="font-mono">{coupon.code}</span> −{coupon.percent}%{' '}
                    {coupon.active ? <Status status="active" /> : <Status status="ended" />}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={!!pending}
        title={
          pending?.kind === 'end'
            ? 'Kết thúc chiến dịch'
            : pending?.kind === 'pause'
              ? 'Tạm dừng quảng cáo'
              : 'Tạm dừng toàn bộ quảng cáo'
        }
        message={
          pending?.kind === 'end' ? (
            <>
              Kết thúc <strong>{pending.campaign.name || pending.campaign.ref}</strong>: dừng mã giảm giá, giảm giá sản
              phẩm và quảng cáo của chiến dịch. Ngân sách chưa chi sẽ được hoàn lại.
            </>
          ) : pending?.kind === 'pause' ? (
            <>
              Tạm dừng quảng cáo <strong>{pending.ref}</strong> trên nền tảng.
            </>
          ) : (
            <>Tạm dừng mọi quảng cáo đang chạy của Agent. Các quản trị viên sẽ nhận được email thông báo.</>
          )
        }
        confirmLabel="Xác nhận"
        danger
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  );
};

export default Campaigns;
