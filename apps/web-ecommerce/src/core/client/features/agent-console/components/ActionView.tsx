import type { ReviewAction } from '@/shared/types/agent';
import { INVENTORY_STATUS_LABELS, roleLabel } from './agentLabels';

// Action renderers: one per Agent API action type, so a person reads what will run, not JSON. A type without a
// renderer falls back to its description and body (new capabilities show up without a console change).
type Renderer = (body: Record<string, unknown>) => React.ReactNode;

const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
const vnd = (value: unknown) => `${Number(value ?? 0).toLocaleString('vi-VN')} ₫`;
const PLATFORMS: Record<string, string> = { meta: 'Facebook/Instagram', google: 'Google Tìm kiếm', tiktok: 'TikTok' };

// How a customer sees the copy: the post or ad text as it will be published.
const Preview = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <span className="mt-1 block rounded border border-stroke bg-gray-2 p-3 text-sm dark:border-strokedark dark:bg-meta-4">
    <span className="mb-1 block text-xs font-semibold uppercase text-body">{title}</span>
    {children}
  </span>
);

const RENDERERS: Record<string, Renderer> = {
  apply_discount: (body) => (
    <>
      Giảm <strong>{String(body.percent)}%</strong> trong <strong>{String(body.duration_days)} ngày</strong> cho{' '}
      {list(body.skus).length} mã: <span className="break-all text-body">{list(body.skus).join(', ')}</span>
    </>
  ),
  switch_channel: (body) => (
    <>
      Chuyển {list(body.skus).length} mã sang kênh <strong>{String(body.to_channel)}</strong>:{' '}
      <span className="break-all text-body">{list(body.skus).join(', ')}</span>
    </>
  ),
  adjust_inventory: (body) => (
    <>
      {String(body.sku)}: <strong>{INVENTORY_STATUS_LABELS[String(body.new_status)] || String(body.new_status)}</strong>
      {body.reason ? <span className="text-body"> ({String(body.reason)})</span> : null}
    </>
  ),
  create_task: (body) => (
    <>
      Giao việc cho <strong>{roleLabel(String(body.assignee_role))}</strong>: {String(body.title)}
      {body.due_in_days != null ? <span className="text-body"> (hạn {String(body.due_in_days)} ngày)</span> : null}
      {body.description ? <span className="block text-sm text-body">{String(body.description)}</span> : null}
    </>
  ),
  update_sop_checklist: (body) => (
    <>
      Bổ sung vào {String(body.sop_id)}: {list(body.add_items).join('; ')}
    </>
  ),
  create_campaign: (body) => (
    <>
      Tạo chiến dịch <strong>{String(body.name)}</strong> ({String(body.ref)}), {String(body.duration_days)} ngày
      {body.budget_vnd ? <>, ngân sách quảng cáo {vnd(body.budget_vnd)}</> : null}
    </>
  ),
  create_coupon: (body) => (
    <>
      Mã <strong>{String(body.code)}</strong>: giảm {String(body.percent)}%
      {body.min_order_vnd ? <> cho đơn từ {vnd(body.min_order_vnd)}</> : null} trong {String(body.duration_days)} ngày
    </>
  ),
  end_promotion: (body) => <>Kết thúc khuyến mãi{body.reason ? `: ${String(body.reason)}` : ''}</>,
  create_post: (body) => (
    <>
      Đăng bài trên Fanpage
      {body.scheduled_at ? ` lúc ${new Date(String(body.scheduled_at)).toLocaleString('vi-VN')}` : ''}
      <Preview title="Bài đăng">
        <span className="whitespace-pre-line text-black dark:text-white">{String(body.message)}</span>
        {body.link_path ? <span className="mt-1 block text-xs text-primary">{String(body.link_path)}</span> : null}
      </Preview>
    </>
  ),
  create_ad: (body) => (
    <>
      Quảng cáo <strong>{PLATFORMS[String(body.platform)] ?? String(body.platform)}</strong>:{' '}
      {vnd(body.daily_budget_vnd)}
      /ngày × {String(body.duration_days)} ngày ={' '}
      <strong>{vnd(Number(body.daily_budget_vnd) * Number(body.duration_days))}</strong>
      <Preview title="Mẫu quảng cáo">
        {body.headline ? <strong className="block text-black dark:text-white">{String(body.headline)}</strong> : null}
        {body.primary_text ? <span className="block">{String(body.primary_text)}</span> : null}
        {list(body.headlines).length > 0 ? (
          <strong className="block text-primary">{list(body.headlines).slice(0, 3).join(' | ')}</strong>
        ) : null}
        {list(body.descriptions).length > 0 ? <span className="block">{list(body.descriptions)[0]}</span> : null}
        {list(body.keywords).length > 0 ? (
          <span className="block text-xs text-body">Từ khóa: {list(body.keywords).join(', ')}</span>
        ) : null}
        {body.ad_text ? <span className="block">{String(body.ad_text)}</span> : null}
      </Preview>
    </>
  ),
  activate_ad: () => <>Bật quảng cáo sau khi tạo</>,
  pause_ad: (body) => <>Tạm dừng quảng cáo{body.reason ? `: ${String(body.reason)}` : ''}</>,
  set_ad_budget: (body) => <>Đổi ngân sách ngày thành {vnd(body.daily_budget_vnd)}</>,
  set_ad_optimization: () => <>Chuyển quảng cáo sang tối ưu theo đơn hàng</>,
};

const ActionView = ({ action }: { action: ReviewAction }) => {
  const render = RENDERERS[action.type];
  return (
    <li className="text-sm">
      {render ? (
        render(action.body)
      ) : (
        <>
          {action.description || action.type}{' '}
          <code className="break-all text-xs text-body">{JSON.stringify(action.body)}</code>
        </>
      )}
    </li>
  );
};

export default ActionView;
