import type { ReturnCondition, ReturnReason, ReturnStatus } from '@/shared/types/return';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: 'Chờ nhận hàng',
  RECEIVED: 'Đã nhận hàng',
  REJECTED: 'Từ chối',
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  wrong_size: 'Sai kích cỡ',
  defective: 'Sản phẩm lỗi',
  not_as_described: 'Không giống mô tả',
  changed_mind: 'Đổi ý',
  other: 'Lý do khác',
};

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  new: 'Còn mới, nguyên tem',
  open_box: 'Đã mở hộp, còn tốt',
  damaged: 'Hư hỏng',
};

const STATUS_CLASSES: Record<ReturnStatus, string> = {
  REQUESTED: 'bg-warning/10 text-warning',
  RECEIVED: 'bg-success/10 text-success',
  REJECTED: 'bg-danger/10 text-danger',
};

const ReturnStatusBadge = ({ status }: { status: ReturnStatus }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}
  >
    {RETURN_STATUS_LABELS[status]}
  </span>
);

export default ReturnStatusBadge;
