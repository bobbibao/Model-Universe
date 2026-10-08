'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { toast } from 'react-toastify';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import AgentServerApi from '@/core/client/api/AgentServer';
import type { ImprovementThread, ImprovementValues, ReviewDecision, ReviewPayload } from '@/shared/types/agent';
import ActionView from '../components/ActionView';
import ReviewPanel from '../components/ReviewPanel';
import {
  OUTCOME_LABELS,
  STAGE_LABELS,
  SeverityBadge,
  StageBadge,
  TIER_LABELS,
  VERDICT_LABELS,
  formatAmount,
  formatDateTime,
  formatImprovement,
  kindLabel,
} from '../components/agentLabels';

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
    <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">{title}</h3>
    {children}
  </section>
);

const percent = (value: number) => `${Math.round(value * 100)}%`;

// One improvement thread: what was detected, the analysis, the options with computed estimates, the decision and
// what ran, the measurement and the lessons. While the thread waits, the review panel takes the decision.
const ThreadDetail = () => {
  const { id } = useParams<{ id: string }>();
  const threadId = decodeURIComponent(id);
  const [thread, setThread] = useState<ImprovementThread | null>();
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [history, setHistory] = useState<{ stage?: string; createdAt: string; step: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await AgentServerApi.getImprovement(threadId);
    if (result === undefined) return;
    setThread(result?.thread ?? null);
    setReview(result?.review ?? null);
    setHistory(await AgentServerApi.getHistory(threadId));
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (decision: ReviewDecision) => {
    setBusy(true);
    const live = (values: ImprovementValues) =>
      setThread((current) => (current ? { ...current, values: { ...current.values, ...values } } : current));
    if (await AgentServerApi.decide(threadId, decision, live)) toast.success('Đã ghi nhận quyết định.');
    await load();
    setBusy(false);
  };

  if (thread === undefined) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }
  if (thread === null) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4">Không tìm thấy đề xuất.</p>
        <Link href="/admin/agent/inbox" className="font-medium text-brand-hover hover:underline">
          Quay lại hộp duyệt
        </Link>
      </div>
    );
  }

  const values = thread.values ?? {};
  const opportunity = values.opportunity;
  const proposal = review ?? values.proposal;
  const options = review?.options ?? (values.options ?? []).filter((option) => option.violations.length === 0);
  const recommended = review?.recommended_option_id ?? values.recommended_option_id;
  const stage = thread.status === 'interrupted' ? 'reviewing' : values.stage;

  return (
    <>
      <Breadcrumb pageName={thread.metadata.title || kindLabel(opportunity?.kind)} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card title="Vấn đề phát hiện">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <StageBadge stage={stage} />
              <SeverityBadge severity={opportunity?.severity} />
              <span className="text-sm text-body">Phát hiện lúc {formatDateTime(opportunity?.detected_at)}</span>
            </div>
            <p className="mb-3 text-black dark:text-bodydark1">{opportunity?.summary}</p>
            <p className="text-sm">
              <span className="text-body">SKU liên quan:</span> {opportunity?.skus.join(', ') || '—'}
            </p>
          </Card>

          {proposal && (
            <Card title="Phân tích">
              <p className="mb-3 whitespace-pre-line">{proposal.summary}</p>
              {proposal.causes.length > 0 && (
                <ul className="mb-3 list-disc pl-5 text-sm">
                  {proposal.causes.map((cause) => (
                    <li key={cause.text}>
                      {cause.text} <span className="text-body">(độ tin cậy {percent(cause.confidence)})</span>
                    </li>
                  ))}
                </ul>
              )}
              {proposal.sop_refs.length > 0 && (
                <p className="text-sm">
                  <span className="text-body">Quy trình (SOP) tham chiếu:</span> {proposal.sop_refs.join(', ')}
                </p>
              )}
            </Card>
          )}

          {options.length > 0 && (
            <Card title="Các phương án">
              <div className="flex flex-col divide-y divide-stroke dark:divide-strokedark">
                {options.map((option) => (
                  <div key={option.option_id} className="py-3">
                    <p className="font-semibold">
                      {option.title}
                      {option.option_id === recommended && (
                        <span className="ml-2 rounded bg-success/10 px-2 py-0.5 text-xs text-success">Đề xuất</span>
                      )}
                      <span className="ml-2 text-xs font-normal text-body">{TIER_LABELS[option.tier]}</span>
                    </p>
                    {option.rationale && <p className="text-sm">{option.rationale}</p>}
                    {'recovery_vnd' in option.estimate && (
                      <p className="mb-2 text-sm text-body">
                        Thu hồi ước tính {formatAmount(option.estimate.recovery_vnd)} · Chi phí{' '}
                        {formatAmount(option.estimate.cost_vnd)} · Giảm lãng phí{' '}
                        {formatAmount(option.estimate.waste_reduction_vnd)}
                      </p>
                    )}
                    {option.actions.length > 0 && (
                      <ol className="flex list-decimal flex-col gap-1 pl-5">
                        {option.actions.map((action) => (
                          <ActionView key={action.action_id} action={action} />
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(values.steps?.length ?? 0) > 0 && (
            <Card title="Thao tác đã thực hiện">
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                {values.steps!.map((step) => {
                  const approved = values.approved?.find((action) => action.action_id === step.action_id);
                  return (
                    <li key={step.idempotency_key}>
                      {approved ? <ActionView action={approved} /> : step.type}{' '}
                      <span className={step.ok ? 'text-success' : 'text-danger'}>
                        [{step.ok ? (step.reverted ? 'đã hoàn tác' : 'thành công') : `lỗi ${step.status_code ?? ''}`}]
                      </span>
                      {!step.ok && step.detail && <span className="block text-xs text-body">{step.detail}</span>}
                    </li>
                  );
                })}
              </ol>
              {values.followup_due_at && values.stage === 'measuring' && (
                <p className="mt-3 text-sm text-body">Đo lường vào {formatDateTime(values.followup_due_at)}</p>
              )}
            </Card>
          )}

          {values.measurement && (
            <Card title="Kết quả đo lường">
              <p className="mb-3">
                <span className="font-semibold">{VERDICT_LABELS[values.measurement.verdict]}</span> ·{' '}
                {values.measurement.summary}
              </p>
              <ul className="text-sm">
                {values.measurement.deltas.map((delta) => (
                  <li key={delta.name}>
                    {delta.name}: {formatImprovement(delta.improvement_pct)}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(values.lessons?.length ?? 0) > 0 && (
            <Card title="Bài học">
              <ul className="list-disc pl-5 text-sm">
                {values.lessons!.map((lesson) => (
                  <li key={lesson}>{lesson}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {review && thread.status === 'interrupted' && <ReviewPanel review={review} busy={busy} onDecide={decide} />}
          <Card title="Tóm tắt">
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-body">Loại vấn đề</dt>
                <dd>{kindLabel(opportunity?.kind)}</dd>
              </div>
              {values.decision && (
                <div>
                  <dt className="text-body">Quyết định</dt>
                  <dd>
                    {values.decision.mode === 'auto' ? 'Tự động theo chính sách' : 'Người duyệt'} ·{' '}
                    {values.decision.type}
                    {values.decision.note && <span className="block">&quot;{values.decision.note}&quot;</span>}
                  </dd>
                </div>
              )}
              {values.outcome && (
                <div>
                  <dt className="text-body">Kết quả</dt>
                  <dd>{OUTCOME_LABELS[values.outcome]}</dd>
                </div>
              )}
              {review?.expires_at && (
                <div>
                  <dt className="text-body">Hết hạn duyệt</dt>
                  <dd>{formatDateTime(review.expires_at)}</dd>
                </div>
              )}
            </dl>
          </Card>
          {history.length > 0 && (
            <Card title="Lịch sử">
              <ol className="flex flex-col gap-1 text-sm">
                {history
                  .filter((item, index, all) => item.stage && item.stage !== all[index + 1]?.stage)
                  .map((item) => (
                    <li key={`${item.step}-${item.createdAt}`}>
                      <span className="text-body">{formatDateTime(item.createdAt)}</span> ·{' '}
                      {STAGE_LABELS[item.stage as keyof typeof STAGE_LABELS] || item.stage}
                    </li>
                  ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default ThreadDetail;
