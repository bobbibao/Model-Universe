'use client';
import { useTranslations } from 'next-intl';
import type { ReturnCondition, ReturnReason, ReturnStatus } from '@/shared/types/return';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: 'Awaiting review',
  RECEIVED: 'Received',
  REJECTED: 'Rejected',
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  wrong_size: 'Historical size mismatch',
  defective: 'Defective model',
  not_as_described: 'Description mismatch',
  changed_mind: 'Changed mind',
  other: 'Other',
  wrong_item: 'Wrong model or version',
  missing_accessories: 'Missing promised accessories',
  undisclosed_defect: 'Undisclosed defect',
  shipping_damage: 'Shipping damage',
};

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  new: 'New and sealed',
  open_box: 'Open box, sellable',
  damaged: 'Damaged',
};

const STATUS_CLASSES: Record<ReturnStatus, string> = {
  REQUESTED: 'bg-warning/10 text-warning',
  RECEIVED: 'bg-success/10 text-success',
  REJECTED: 'bg-danger/10 text-danger',
};

const ReturnStatusBadge = ({ status }: { status: ReturnStatus }) => {
  const t = useTranslations('returns');
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
};

export default ReturnStatusBadge;
