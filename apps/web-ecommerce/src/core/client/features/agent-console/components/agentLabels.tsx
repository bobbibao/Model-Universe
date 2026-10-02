import { formatVND } from '@/shared/server/utils/utils';
import type { ImprovementOutcome, ImprovementStage, RiskTier, Verdict } from '@/shared/types/agent';

// Labels and small formatters for the agent console. Agent-written text (titles, summaries, causes, measurement
// summaries) is Vietnamese already (AGENT_LANGUAGE) and shown as written; amounts are whole VND.

export const STAGE_LABELS: Record<ImprovementStage, string> = {
  new: 'Mới phát hiện',
  investigating: 'Đang phân tích',
  reviewing: 'Chờ duyệt',
  acting: 'Đang thực hiện',
  measuring: 'Đang đo lường',
  learning: 'Đang rút kinh nghiệm',
  closed: 'Đã đóng',
};

const STAGE_CLASSES: Partial<Record<ImprovementStage, string>> = {
  reviewing: 'bg-warning/10 text-warning',
  measuring: 'bg-meta-5/10 text-meta-5',
  closed: 'bg-success/10 text-success',
};

export const StageBadge = ({ stage }: { stage?: ImprovementStage }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
      (stage && STAGE_CLASSES[stage]) || 'bg-primary/10 text-primary'
    }`}
  >
    {stage ? STAGE_LABELS[stage] : '—'}
  </span>
);

export const OUTCOME_LABELS: Record<ImprovementOutcome, string> = {
  measured: 'Đã đo lường',
  rejected: 'Bị từ chối',
  expired: 'Hết hạn duyệt',
  failed: 'Thực hiện lỗi, đã hoàn tác',
  blocked: 'Bị chặn bởi giới hạn',
  no_viable_option: 'Không có phương án khả thi',
  shadow: 'Chế độ quan sát (không thực hiện)',
  do_nothing: 'Giữ nguyên hiện trạng',
};

const SEVERITY: Record<string, { label: string; className: string }> = {
  low: { label: 'Thấp', className: 'bg-body/10 text-body' },
  medium: { label: 'Trung bình', className: 'bg-meta-5/10 text-meta-5' },
  high: { label: 'Cao', className: 'bg-warning/10 text-warning' },
  critical: { label: 'Nghiêm trọng', className: 'bg-danger/10 text-danger' },
};

export const SeverityBadge = ({ severity }: { severity?: string }) => {
  const entry = SEVERITY[severity || ''] || { label: severity || '—', className: 'bg-body/10 text-body' };
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${entry.className}`}>
      {entry.label}
    </span>
  );
};

export const TIER_LABELS: Record<RiskTier, string> = {
  protective: 'Bảo vệ',
  low: 'Rủi ro thấp',
  medium: 'Rủi ro trung bình',
  high: 'Rủi ro cao',
  blocked: 'Bị chặn',
};

export const KIND_LABELS: Record<string, string> = {
  dead_stock: 'Hàng tồn lâu',
  high_returns: 'Tỷ lệ đổi trả cao',
  revenue_gap: 'Doanh thu chậm so với mục tiêu',
  overstock: 'Tồn kho cao',
  rising_demand: 'Nhu cầu tăng',
  competitor_undercut: 'Đối thủ bán rẻ hơn',
  competitor_campaign: 'Đối thủ chạy khuyến mãi',
  trend_spike: 'Xu hướng tìm kiếm tăng',
  seasonal_event: 'Sắp đến dịp mua sắm',
  content_cadence: 'Lâu chưa đăng bài',
  new_arrivals: 'Hàng mới về',
  campaign_scaling: 'Quảng cáo đang hiệu quả',
  bidding_upgrade: 'Tối ưu quảng cáo theo đơn hàng',
  weekly_plan: 'Kế hoạch tuần',
  incident_review: 'Xem lại sự cố',
};

export const kindLabel = (kind?: string) => (kind ? KIND_LABELS[kind] || kind : '—');

export const VERDICT_LABELS: Record<Verdict, string> = {
  success: 'Thành công',
  positive: 'Tích cực',
  inconclusive: 'Chưa rõ ràng',
  negative: 'Tiêu cực',
};

// Fields a person may edit in an option (the agent's editable_fields).
export const FIELD_LABELS: Record<string, string> = {
  percent: 'Mức giảm (%)',
  duration_days: 'Thời gian (ngày)',
  title: 'Tiêu đề công việc',
  description: 'Mô tả công việc',
  due_in_days: 'Hạn xử lý (ngày)',
  add_items: 'Mục bổ sung vào checklist',
  name: 'Tên chiến dịch',
  budget_vnd: 'Ngân sách chiến dịch (₫)',
  min_order_vnd: 'Đơn tối thiểu (₫)',
  usage_limit: 'Số lượt dùng tối đa',
  message: 'Nội dung bài đăng',
  scheduled_at: 'Thời điểm đăng',
  daily_budget_vnd: 'Ngân sách ngày (₫)',
  headline: 'Tiêu đề quảng cáo',
  primary_text: 'Nội dung quảng cáo',
  headlines: 'Các tiêu đề (mỗi dòng một tiêu đề)',
  descriptions: 'Các mô tả (mỗi dòng một mô tả)',
};

export const fieldLabel = (name: string) => FIELD_LABELS[name] || name;

// Editing a body field in a text box: numbers stay numbers and lists are one item per line, so an edited body keeps
// its JSON types (the grant is signed over it). A numeric field the body does not have yet is still a number.
const NUMERIC_FIELDS = new Set([
  'percent',
  'duration_days',
  'due_in_days',
  'min_order_vnd',
  'usage_limit',
  'daily_budget_vnd',
  'budget_vnd',
]);

export const parseFieldValue = (raw: string, original: unknown, field?: string): unknown => {
  if (typeof original === 'number' || (original === undefined && field && NUMERIC_FIELDS.has(field))) {
    return raw.trim() === '' ? NaN : Number(raw);
  }
  if (Array.isArray(original))
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  return raw;
};

export const showFieldValue = (value: unknown) => (Array.isArray(value) ? value.join('\n') : String(value ?? ''));

// Staff roles the agent assigns tasks to (`assignee_role`).
const ROLE_LABELS: Record<string, string> = {
  merchandiser: 'Trưng bày & bán hàng',
  warehouse: 'Kho',
  logistics: 'Vận chuyển',
};

export const roleLabel = (role: string | null | undefined) => (role ? ROLE_LABELS[role] || role : '—');

export const INVENTORY_STATUS_LABELS: Record<string, string> = {
  restock: 'nhập lại kho',
  available: 'mở bán',
  quarantine: 'cách ly',
  donation_pending: 'chờ quyên góp',
  recycle: 'tái chế',
};

export const formatAmount = (value: number | undefined) => formatVND(value || 0);

export const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('vi-VN') : '—';

export const formatImprovement = (value: number) =>
  `${value > 0 ? '▲ +' : value < 0 ? '▼ ' : ''}${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
