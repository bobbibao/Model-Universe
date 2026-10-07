'use client';

import { useMemo, useState } from 'react';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import { inputClassName } from '@/components/FormElements/TextField';
import AuthApi from '@/core/client/api/Auth';
import type { ReviewAction, ReviewDecision, ReviewOption, ReviewPayload } from '@/shared/types/agent';
import { TIER_LABELS, fieldLabel, formatAmount, parseFieldValue, showFieldValue } from './agentLabels';

interface ReviewPanelProps {
  review: ReviewPayload;
  busy: boolean;
  onDecide: (decision: ReviewDecision) => Promise<void>;
}

// The editable fields of an option and their current values (first action that declares each field).
const editableFields = (actions: ReviewAction[]) => {
  const fields = new Map<string, unknown>();
  for (const action of actions) {
    for (const field of action.editable_fields) {
      if (!fields.has(field) && field in action.body) fields.set(field, action.body[field]);
    }
  }
  return fields;
};

const TIER_STYLES: Record<string, string> = {
  low: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-danger/10 text-danger',
};

// What the selected option is expected to bring (ranges, never one number), its risk tier and the brand check.
const OptionFacts = ({ option }: { option: ReviewOption }) => {
  const estimate = option.estimate;
  const growth = 'profit_vnd' in estimate ? estimate : null;
  return (
    <div className="mb-4 rounded border border-stroke p-3 text-sm dark:border-strokedark">
      <span className={`mr-2 rounded px-2 py-0.5 text-xs ${TIER_STYLES[option.tier] ?? 'bg-gray-2 text-body'}`}>
        {TIER_LABELS[option.tier] ?? option.tier}
      </span>
      {option.needs_human && <span className="text-danger">Nội dung chưa đạt chuẩn thương hiệu, cần bạn xem kỹ.</span>}
      {growth && (
        <p className="mt-2">
          Lợi nhuận gộp tăng thêm dự kiến: {formatAmount(growth.profit_vnd.p10)} đến{' '}
          {formatAmount(growth.profit_vnd.p90)} (trung vị {formatAmount(growth.profit_vnd.p50)}, độ tin cậy{' '}
          {Math.round(growth.confidence * 100)}%). Chi quảng cáo {formatAmount(growth.spend_vnd)}, chi phí giảm giá{' '}
          {formatAmount(growth.discount_cost_vnd)}.
        </p>
      )}
      {option.brand?.scores && (
        <p className="mt-1 text-body">
          Đánh giá thương hiệu: {option.brand.scores.map((s) => `${s.criterion} ${s.score}/5`).join(', ')}
        </p>
      )}
      {option.brand?.lint && option.brand.lint.length > 0 && (
        <p className="mt-1 text-danger">{option.brand.lint.join('; ')}</p>
      )}
    </div>
  );
};

// One decision for the pending review: approve an option (optionally editing the fields the agent declared
// editable), reject it with a reason, or ask the agent to look again. The web gateway signs the approval over the
// exact actions that will run; the agent re-checks its limits on the edited values.
const ReviewPanel = ({ review, busy, onDecide }: ReviewPanelProps) => {
  const [optionId, setOptionId] = useState(review.recommended_option_id);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ReviewDecision | null>(null);
  const [password, setPassword] = useState('');
  const [total, setTotal] = useState('');

  const option = review.options.find((item) => item.option_id === optionId) ?? review.options[0];
  const high = option?.tier === 'high';
  // A high-tier option is approved as shown (the typed total must match what is signed): no edits.
  const fields = useMemo(
    () => (high ? new Map<string, unknown>() : editableFields(option?.actions ?? [])),
    [option, high],
  );
  const canRespond = review.allowed_decisions.includes('respond');

  const changedArgs = (): Record<string, unknown> | null => {
    const args: Record<string, unknown> = {};
    for (const [field, original] of fields) {
      if (edits[field] === undefined) continue;
      const value = parseFieldValue(edits[field], original);
      if (typeof value === 'number' && !Number.isFinite(value)) return null;
      if (JSON.stringify(value) !== JSON.stringify(original)) args[field] = value;
    }
    return args;
  };

  const request = (type: ReviewDecision['type']) => {
    setError('');
    if ((type === 'reject' || type === 'respond') && !note.trim()) {
      setError(type === 'reject' ? 'Vui lòng ghi lý do từ chối.' : 'Vui lòng cho biết cần phân tích thêm điều gì.');
      return;
    }
    if (type === 'reject' || type === 'respond') {
      setPending({ type, note: note.trim() });
      return;
    }
    const args = changedArgs();
    if (args === null) {
      setError('Giá trị điều chỉnh phải là số.');
      return;
    }
    if (high && (!password || Number(total.replace(/\D/g, '')) !== option.total_vnd)) {
      setError('Phương án rủi ro cao: nhập lại mật khẩu và gõ đúng tổng số tiền.');
      return;
    }
    const edited = Object.keys(args).length > 0;
    setPending({
      type: edited ? 'edit' : 'approve',
      option_id: option.option_id,
      ...(edited ? { args } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(high ? { confirm_total_vnd: option.total_vnd } : {}),
    });
  };

  const summary = (decision: ReviewDecision) => {
    if (decision.type === 'reject') return `Từ chối đề xuất với lý do: "${decision.note}"`;
    if (decision.type === 'respond') return `Yêu cầu Agent phân tích thêm: "${decision.note}"`;
    const changes = Object.entries(decision.args ?? {}).map(
      ([field, value]) => `${fieldLabel(field)} ${showFieldValue(fields.get(field))} → ${showFieldValue(value)}`,
    );
    return (
      <>
        <p>Duyệt phương án &quot;{option.title}&quot;. Các thao tác sẽ được thực hiện ngay.</p>
        {changes.length > 0 && <p className="mt-2">Điều chỉnh: {changes.join('; ')}</p>}
      </>
    );
  };

  return (
    <section className="rounded-sm border border-warning bg-white p-6 shadow-default dark:bg-boxdark">
      <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">Cần bạn quyết định</h3>
      {review.error && <p className="mb-3 rounded bg-danger/10 p-3 text-sm text-danger">{review.error}</p>}
      <fieldset className="mb-4 flex flex-col gap-2">
        <legend className="mb-2 text-sm text-body">Chọn phương án</legend>
        {review.options.map((item) => (
          <label key={item.option_id} className="flex items-center gap-2">
            <input
              type="radio"
              name="option"
              checked={item.option_id === option?.option_id}
              onChange={() => {
                setOptionId(item.option_id);
                setEdits({});
              }}
            />
            <span>
              {item.title}
              {item.option_id === review.recommended_option_id && (
                <span className="ml-2 rounded bg-success/10 px-2 py-0.5 text-xs text-success">Đề xuất</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {option && <OptionFacts option={option} />}
      {high && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-body">Nhập lại mật khẩu</span>
            <input
              type="password"
              className={inputClassName}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-body">Gõ tổng số tiền {formatAmount(option.total_vnd)}</span>
            <input
              className={inputClassName}
              inputMode="numeric"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
            />
          </label>
        </div>
      )}
      {fields.size > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[...fields].map(([field, original]) => (
            <label key={field} className="text-sm">
              <span className="mb-1 block text-body">{fieldLabel(field)}</span>
              {Array.isArray(original) ? (
                <textarea
                  className={inputClassName}
                  rows={3}
                  value={edits[field] ?? showFieldValue(original)}
                  onChange={(event) => setEdits({ ...edits, [field]: event.target.value })}
                />
              ) : (
                <input
                  className={inputClassName}
                  inputMode={typeof original === 'number' ? 'decimal' : 'text'}
                  aria-label={fieldLabel(field)}
                  value={edits[field] ?? showFieldValue(original)}
                  onChange={(event) => setEdits({ ...edits, [field]: event.target.value })}
                />
              )}
            </label>
          ))}
        </div>
      )}
      <textarea
        className={`${inputClassName} mb-3`}
        rows={2}
        placeholder="Ghi chú (bắt buộc khi từ chối hoặc yêu cầu phân tích thêm)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          disabled={busy}
          onClick={() => request('approve')}
          className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
        >
          Duyệt phương án đã chọn
        </button>
        <button
          disabled={busy}
          onClick={() => request('reject')}
          className="rounded-md border border-danger px-4 py-2 font-medium text-danger disabled:opacity-60"
        >
          Từ chối
        </button>
        {canRespond && (
          <button
            disabled={busy}
            onClick={() => request('respond')}
            className="rounded-md border border-stroke px-4 py-2 font-medium disabled:opacity-60 dark:border-strokedark"
          >
            Yêu cầu phân tích thêm
          </button>
        )}
      </div>
      <ConfirmModal
        open={pending !== null}
        title="Xác nhận quyết định"
        message={pending ? summary(pending) : ''}
        confirmLabel={pending?.type === 'reject' ? 'Từ chối' : pending?.type === 'respond' ? 'Gửi' : 'Duyệt'}
        danger={pending?.type === 'reject'}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending?.confirm_total_vnd !== undefined && !(await AuthApi.stepUp(password))) {
            setError('Mật khẩu không chính xác.');
            setPending(null);
            return;
          }
          if (pending) await onDecide(pending);
          setPending(null);
          setPassword('');
        }}
      />
    </section>
  );
};

export default ReviewPanel;
