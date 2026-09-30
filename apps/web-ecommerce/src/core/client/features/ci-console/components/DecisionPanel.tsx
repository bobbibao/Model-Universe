'use client';

import { useMemo, useState } from 'react';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import { inputClassName } from '@/components/FormElements/TextField';
import CiApi from '@/core/client/api/Ci';
import type { CiDecisionPayload, CiImprovementDetail, CiOption } from '@/shared/types/ci';
import { DECISION_LABELS, RISK_LABELS, formatAmount, paramLabel } from './ciLabels';

type Decision = CiDecisionPayload['decision'];

interface DecisionPanelProps {
  improvement: CiImprovementDetail;
  onDecided: (improvement: CiImprovementDetail) => void;
}

const numericParams = (option?: CiOption) =>
  (option?.params || []).filter((param): param is { name: string; value: number } => typeof param.value === 'number');

// Answers the open question: approve one option (optionally adjusting its numeric parameters), reject, or ask
// the agent for more analysis. The agent re-checks the approver's role and the guardrails before acting.
const DecisionPanel = ({ improvement, onDecided }: DecisionPanelProps) => {
  const question = improvement.question;
  const [optionId, setOptionId] = useState(question?.recommendedOptionId || improvement.options[0]?.optionId || '');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState('');

  const selected = improvement.options.find((option) => option.optionId === optionId);
  const editable = useMemo(() => numericParams(selected), [selected]);

  const selectOption = (nextOptionId: string) => {
    setOptionId(nextOptionId);
    setOverrides({});
  };

  // Only values the admin actually changed are sent, under the option's original parameter names.
  const changedOverrides = (): Record<string, number> | null => {
    const result: Record<string, number> = {};
    for (const param of editable) {
      const raw = overrides[param.name];
      if (raw === undefined || raw.trim() === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      if (value !== param.value) result[param.name] = value;
    }
    return result;
  };

  const requestDecision = (decision: Decision) => {
    setError('');
    if (decision === 'clarify' && !note.trim()) {
      setError('Vui lòng cho biết cần phân tích thêm điều gì.');
      return;
    }
    if (decision === 'approve' && changedOverrides() === null) {
      setError('Giá trị điều chỉnh phải là số.');
      return;
    }
    setPending(decision);
  };

  const submit = async () => {
    if (!pending) return;
    const payload: CiDecisionPayload = { decision: pending, note: note.trim() || undefined };
    if (pending === 'approve') {
      payload.optionId = optionId;
      payload.overrides = changedOverrides() || {};
    }
    const updated = await CiApi.decide(improvement.id, payload);
    setPending(null);
    if (updated) onDecided(updated);
  };

  // The option title keeps the proposed values ("20% discount ..."), so the confirmation names what was changed.
  const changedList = Object.entries(changedOverrides() || {}).map(([name, to]) => ({
    name,
    from: editable.find((param) => param.name === name)?.value ?? to,
    to,
  }));

  if (!question || question.status !== 'open') return null;

  return (
    <section className="rounded-sm border border-warning bg-white p-6 shadow-default dark:bg-boxdark">
      <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">Cần bạn quyết định</h3>
      <p className="mb-1 whitespace-pre-line text-black dark:text-bodydark1">{question.prompt}</p>
      <p className="mb-4 text-sm text-body">
        Hạn trả lời: {new Date(question.expiresAt).toLocaleString('vi-VN')} · Lần hỏi thứ {question.attempt}
      </p>

      <fieldset className="mb-4 flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-black dark:text-white">Chọn phương án</legend>
        {improvement.options.map((option) => (
          <label
            key={option.optionId}
            className={`flex cursor-pointer gap-3 rounded border p-3 ${
              option.optionId === optionId ? 'border-brand-hover' : 'border-stroke dark:border-strokedark'
            }`}
          >
            <input
              type="radio"
              name="ci-option"
              className="mt-1 accent-brand-hover"
              checked={option.optionId === optionId}
              onChange={() => selectOption(option.optionId)}
            />
            <span className="text-sm">
              <span className="font-semibold">{option.title}</span>
              {option.optionId === question.recommendedOptionId && (
                <span className="ml-2 rounded bg-success/10 px-2 py-0.5 text-xs text-success">Đề xuất</span>
              )}
              <span className="block text-body">
                Thu hồi ước tính {formatAmount(option.estRecoveryValue)} · Chi phí {formatAmount(option.estCost)} ·{' '}
                {RISK_LABELS[option.risk] || option.risk}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {editable.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {editable.map((param) => (
            <div key={param.name}>
              <label htmlFor={`ci-param-${param.name}`} className="mb-1 block text-sm font-medium">
                {paramLabel(param.name)}
              </label>
              <input
                id={`ci-param-${param.name}`}
                inputMode="decimal"
                className={`${inputClassName} !py-2`}
                placeholder={String(param.value)}
                value={overrides[param.name] ?? ''}
                onChange={(event) => setOverrides({ ...overrides, [param.name]: event.target.value })}
              />
            </div>
          ))}
          <p className="col-span-2 text-xs text-body">Để trống để giữ giá trị đề xuất.</p>
        </div>
      )}

      <label htmlFor="ci-note" className="mb-1 block text-sm font-medium">
        Ghi chú
      </label>
      <textarea
        id="ci-note"
        rows={3}
        maxLength={1000}
        className={inputClassName}
        placeholder="Lý do từ chối, hoặc điều cần phân tích thêm..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-col gap-3">
        <button
          onClick={() => requestDecision('approve')}
          disabled={!selected}
          className="rounded-md bg-brand px-4 py-2.5 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
        >
          Duyệt phương án đã chọn
        </button>
        <button
          onClick={() => requestDecision('clarify')}
          className="rounded-md border border-stroke px-4 py-2.5 font-medium hover:border-brand-hover hover:text-brand-hover dark:border-strokedark"
        >
          Yêu cầu phân tích thêm
        </button>
        <button
          onClick={() => requestDecision('reject')}
          className="rounded-md border border-danger px-4 py-2.5 font-medium text-danger hover:bg-danger hover:text-white"
        >
          Từ chối
        </button>
      </div>

      <ConfirmModal
        open={!!pending}
        title={pending ? DECISION_LABELS[pending] : ''}
        message={
          pending === 'approve' ? (
            <>
              Duyệt phương án <strong>{selected?.title}</strong>
              {changedList.length > 0 && (
                <>
                  {' '}
                  với điều chỉnh:{' '}
                  <strong>
                    {changedList
                      .map(
                        ({ name, from, to }) =>
                          `${paramLabel(name)} ${from.toLocaleString('vi-VN')} → ${to.toLocaleString('vi-VN')}`,
                      )
                      .join(', ')}
                  </strong>
                </>
              )}
              ? Hệ thống sẽ lập kế hoạch và thực hiện ngay trên cửa hàng (có thể hoàn tác).
            </>
          ) : pending === 'reject' ? (
            <>Từ chối đề xuất này? Quyết định sẽ được lưu lại để hệ thống rút kinh nghiệm.</>
          ) : (
            <>Gửi yêu cầu phân tích thêm cho hệ thống?</>
          )
        }
        confirmLabel={pending ? DECISION_LABELS[pending] : 'Xác nhận'}
        danger={pending === 'reject'}
        onConfirm={submit}
        onClose={() => setPending(null)}
      />
    </section>
  );
};

export default DecisionPanel;
