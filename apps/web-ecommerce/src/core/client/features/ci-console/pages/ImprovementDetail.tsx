'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import CiApi from '@/core/client/api/Ci';
import type { CiImprovementDetail, CiParam } from '@/shared/types/ci';
import DecisionPanel from '../components/DecisionPanel';
import {
  ACTION_STATUS_LABELS,
  CauseSourceBadge,
  CiStatusBadge,
  DECISION_LABELS,
  IMPROVEMENT_STATUS_LABELS,
  RISK_LABELS,
  SeverityBadge,
  formatAmount,
  formatKpiValue,
  formatDateTime,
  formatParamValue,
  kpiLabel,
  paramLabel,
  signalLabel,
  strategyLabel,
} from '../components/ciLabels';

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
    <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">{title}</h3>
    {children}
  </section>
);

const ParamList = ({ params }: { params: CiParam[] }) => (
  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
    {params.map((param) => (
      <div key={param.name} className="flex gap-2">
        <dt className="text-body">{paramLabel(param.name)}:</dt>
        <dd className="break-all">{formatParamValue(param.value, param.name)}</dd>
      </div>
    ))}
  </dl>
);

const percent = (value: number) => `${Math.round(value * 100)}%`;

const ImprovementDetail = () => {
  const params = useParams<{ id: string }>();
  const improvementId = decodeURIComponent(params.id);
  const [improvement, setImprovement] = useState<CiImprovementDetail | null>();
  const [loadStatus, setLoadStatus] = useState(0);

  const load = useCallback(async () => {
    const result = await CiApi.getImprovement(improvementId);
    setLoadStatus(result.status);
    setImprovement(result.improvement ?? null);
  }, [improvementId]);

  useEffect(() => {
    load();
  }, [load]);

  if (improvement === undefined) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (improvement === null && loadStatus !== 404) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4">Chưa tải được đề xuất: dịch vụ AI tạm thời không trả lời. Vui lòng thử lại sau.</p>
        <button
          onClick={() => {
            setImprovement(undefined);
            load();
          }}
          className="mr-4 font-medium text-brand-hover hover:underline"
        >
          Thử lại
        </button>
        <Link href="/admin/ci/improvements" className="font-medium text-brand-hover hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  if (improvement === null) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4">Không tìm thấy đề xuất cải tiến.</p>
        <Link href="/admin/ci/improvements" className="font-medium text-brand-hover hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const { finding, plan, measurement } = improvement;

  return (
    <>
      <Breadcrumb pageName={signalLabel(improvement.signalKind)} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card title="Vấn đề phát hiện">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <CiStatusBadge status={improvement.status} />
              <SeverityBadge severity={improvement.severity} />
              <span className="text-sm text-body">Phát hiện lúc {formatDateTime(improvement.createdAt)}</span>
            </div>
            <p className="mb-3 text-black dark:text-bodydark1">{improvement.summary}</p>
            <p className="mb-2 text-sm">
              <span className="text-body">SKU liên quan:</span> {improvement.subjectSkus.join(', ') || '—'}
            </p>
            {improvement.metrics.length > 0 && <ParamList params={improvement.metrics} />}
          </Card>

          {finding && (
            <Card title="Phân tích">
              <p className="mb-3 whitespace-pre-line">{finding.summary}</p>
              {finding.causes.length > 0 && (
                <ul className="mb-3 list-disc pl-5 text-sm">
                  {finding.causes.map((cause) => (
                    <li key={cause.description}>
                      {cause.description} <span className="text-body">(độ tin cậy {percent(cause.confidence)})</span>
                      <CauseSourceBadge source={cause.source} />
                    </li>
                  ))}
                </ul>
              )}
              {finding.sopRefs.length > 0 && (
                <p className="text-sm">
                  <span className="text-body">Quy trình (SOP) tham chiếu:</span> {finding.sopRefs.join(', ')}
                </p>
              )}
            </Card>
          )}

          {improvement.options.length > 0 && (
            <Card title="Các phương án">
              <div className="flex flex-col divide-y divide-stroke dark:divide-strokedark">
                {improvement.options.map((option) => (
                  <div key={option.optionId} className="py-3">
                    <p className="font-semibold">
                      {option.title}
                      {option.optionId === improvement.question?.recommendedOptionId && (
                        <span className="ml-2 rounded bg-success/10 px-2 py-0.5 text-xs text-success">Đề xuất</span>
                      )}
                    </p>
                    <p className="mb-2 text-sm text-body">
                      Thu hồi ước tính {formatAmount(option.estRecoveryValue)} · Chi phí {formatAmount(option.estCost)}{' '}
                      · Giảm lãng phí {formatAmount(option.estWasteReduction)} ·{' '}
                      {RISK_LABELS[option.risk] || option.risk}
                    </p>
                    <ParamList params={option.params} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {plan && (
            <Card title="Kế hoạch & thực hiện">
              <p className="mb-3 text-sm text-body">
                Chiến lược {strategyLabel(plan.strategy)} · Mã kế hoạch {plan.planHash.slice(0, 12)} · Đo lường sau{' '}
                {plan.evaluateAfterDays} ngày
                {improvement.measureDueAt && ` (${formatDateTime(improvement.measureDueAt)})`}
              </p>
              <ol className="flex list-decimal flex-col gap-3 pl-5">
                {plan.actions.map((action, step) => {
                  const record = improvement.actionRecords.find((item) => item.step === step);
                  return (
                    <li key={step}>
                      <p className="font-medium">
                        {action.description || action.type}
                        {record && <span className="ml-2 text-sm text-body">[{ACTION_STATUS_LABELS[record.status] || record.status}]</span>}
                      </p>
                      <ParamList params={action.params} />
                      {record?.detail && <p className="text-xs text-body">{record.detail}</p>}
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {measurement && (
            <Card title="Kết quả đo lường">
              <p className="mb-3">
                <span className="font-semibold">{measurement.verdict}</span> · {measurement.summary}
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-body">
                    <th className="py-1">Chỉ số</th>
                    <th className="py-1">Trước</th>
                    <th className="py-1">Sau</th>
                    <th className="py-1">Thay đổi</th>
                  </tr>
                </thead>
                <tbody>
                  {measurement.deltas.map((delta) => (
                    <tr key={delta.name} className="border-t border-stroke dark:border-strokedark">
                      <td className="py-1">{kpiLabel(delta.name)}</td>
                      <td className="py-1">{formatKpiValue(delta.baseline, delta.unit)}</td>
                      <td className="py-1">{formatKpiValue(delta.current, delta.unit)}</td>
                      <td className={`py-1 font-medium ${delta.improved ? 'text-success' : 'text-danger'}`}>
                        {delta.deltaPct > 0 ? '+' : ''}
                        {delta.deltaPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <DecisionPanel key={improvement.question?.id} improvement={improvement} onDecided={setImprovement} />

          {improvement.answers.length > 0 && (
            <Card title="Quyết định đã ghi nhận">
              <ul className="flex flex-col gap-3 text-sm">
                {improvement.answers.map((answer) => (
                  <li key={`${answer.questionId}-${answer.answeredAt}`}>
                    <p className="font-medium">
                      {DECISION_LABELS[answer.decision] || answer.decision}
                      {answer.optionId && ` · ${answer.optionId}`}
                    </p>
                    <p className="text-body">
                      {answer.answeredBy} qua {answer.channel} · {formatDateTime(answer.answeredAt)}
                    </p>
                    {answer.note && <p className="italic">“{answer.note}”</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Lịch sử">
            <ol className="relative flex flex-col gap-3 border-l border-stroke pl-4 text-sm dark:border-strokedark">
              {improvement.history.map((entry, index) => (
                <li key={`${entry.status}-${index}`}>
                  <p className="font-medium">{IMPROVEMENT_STATUS_LABELS[entry.status] || entry.status}</p>
                  <p className="text-body">
                    {formatDateTime(entry.at)}
                    {entry.note && ` · ${entry.note}`}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
};

export default ImprovementDetail;
