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
};

export const kindLabel = (kind?: string) => (kind ? KIND_LABELS[kind] || kind : '—');

export const VERDICT_LABELS: Record<Verdict, string> = {
  success: 'Thành công',
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
};

export const fieldLabel = (name: string) => FIELD_LABELS[name] || name;

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
