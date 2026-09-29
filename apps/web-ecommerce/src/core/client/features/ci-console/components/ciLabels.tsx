import type { CiImprovementStatus } from '@/shared/types/ci';

// Labels and small formatters shared by the CI Console pages. Agent-generated text (summaries, questions,
// option titles) is shown as the agent wrote it.

export const IMPROVEMENT_STATUS_LABELS: Record<CiImprovementStatus, string> = {
  detected: 'Mới phát hiện',
  investigating: 'Đang phân tích',
  awaiting_human: 'Chờ duyệt',
  approved: 'Đã duyệt',
  planned: 'Đã lập kế hoạch',
  acting: 'Đang thực hiện',
  act_failed: 'Thực hiện lỗi',
  acted: 'Đã thực hiện',
  measuring: 'Đang đo lường',
  rejected: 'Bị từ chối',
  expired: 'Hết hạn trả lời',
  dismissed: 'Bỏ qua',
  learning: 'Đang rút kinh nghiệm',
  closed: 'Đã đóng',
};

const STATUS_CLASSES: Partial<Record<CiImprovementStatus, string>> = {
  awaiting_human: 'bg-warning/10 text-warning',
  act_failed: 'bg-danger/10 text-danger',
  rejected: 'bg-danger/10 text-danger',
  expired: 'bg-body/10 text-body',
  dismissed: 'bg-body/10 text-body',
  closed: 'bg-success/10 text-success',
};

export const CiStatusBadge = ({ status }: { status: CiImprovementStatus }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
      STATUS_CLASSES[status] || 'bg-meta-5/10 text-meta-5'
    }`}
  >
    {IMPROVEMENT_STATUS_LABELS[status] || status}
  </span>
);

const SEVERITY: Record<string, { label: string; className: string }> = {
  low: { label: 'Thấp', className: 'bg-body/10 text-body' },
  medium: { label: 'Trung bình', className: 'bg-meta-5/10 text-meta-5' },
  high: { label: 'Cao', className: 'bg-warning/10 text-warning' },
  critical: { label: 'Nghiêm trọng', className: 'bg-danger/10 text-danger' },
};

export const SeverityBadge = ({ severity }: { severity: string }) => {
  const entry = SEVERITY[severity] || { label: severity, className: 'bg-body/10 text-body' };
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${entry.className}`}>
      {entry.label}
    </span>
  );
};

export const SIGNAL_KIND_LABELS: Record<string, string> = {
  dead_stock: 'Hàng tồn lâu',
  high_returns: 'Tỷ lệ trả hàng cao',
  near_expiry: 'Sắp hết hạn',
};

export const RISK_LABELS: Record<string, string> = {
  low: 'Rủi ro thấp',
  medium: 'Rủi ro trung bình',
  high: 'Rủi ro cao',
};

export const DECISION_LABELS: Record<string, string> = {
  approve: 'Duyệt',
  reject: 'Từ chối',
  clarify: 'Yêu cầu phân tích thêm',
};

const PARAM_LABELS: Record<string, string> = {
  percent: 'Mức giảm (%)',
  duration_days: 'Thời gian (ngày)',
  bundle_discount_pct: 'Giảm giá combo (%)',
  skus: 'SKU',
};

export const paramLabel = (name: string) => PARAM_LABELS[name] || name;

export const signalLabel = (kind: string) => SIGNAL_KIND_LABELS[kind] || kind;

// Amounts from the agent are shown as plain numbers until its currency is settled with real shop reads (T-03).
export const formatAmount = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

export const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('vi-VN') : '—';

export const formatParamValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '—');
};
