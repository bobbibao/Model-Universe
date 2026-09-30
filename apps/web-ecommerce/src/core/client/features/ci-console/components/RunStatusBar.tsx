'use client';

import { useEffect, useRef, useState } from 'react';
import camelCaseKeys from 'camelcase-keys';
import CiApi from '@/core/client/api/Ci';
import { ADMIN_CI_API } from '@/core/client/api/endpoint';
import type { CiLastRun, CiRunProgress, CiRunStatus, CiRunTrigger } from '@/shared/types/ci';
import { formatDateTime } from './ciLabels';

const TRIGGER_LABELS: Record<CiRunTrigger, string> = { manual: 'thủ công', scheduler: 'tự động' };

type StreamEvent = { event: string; trigger?: CiRunTrigger; at?: string; done?: number; total?: number | null };

// The agent's run state above the inbox: scheduler, the run in progress (live, over server-sent events), the last
// run, and a DEMO badge when the agent measures results after minutes instead of the plan's window.
const RunStatusBar = ({ onRunFinished, onRunningChange }: {
  onRunFinished: () => void;
  onRunningChange?: (running: boolean) => void;
}) => {
  const [status, setStatus] = useState<CiRunStatus>();
  const [progress, setProgress] = useState<CiRunProgress | null>(null);
  const [live, setLive] = useState(false);
  const callbacks = useRef({ onRunFinished, onRunningChange });
  callbacks.current = { onRunFinished, onRunningChange };

  useEffect(() => {
    let closed = false;
    const refresh = async () => {
      const next = await CiApi.getRunStatus();
      if (!closed && next) {
        setStatus(next);
        setProgress(next.running);
      }
    };
    refresh();
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(ADMIN_CI_API.RUN_EVENTS);
    const parse = (message: MessageEvent) => camelCaseKeys(JSON.parse(message.data), { deep: true }) as StreamEvent;
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false); // EventSource reconnects by itself while the agent is reachable
    source.addEventListener('run_started', (message) => {
      const data = parse(message as MessageEvent);
      setProgress({ trigger: data.trigger ?? 'manual', startedAt: data.at ?? '', done: 0, total: null });
      callbacks.current.onRunningChange?.(true);
    });
    source.addEventListener('detected', (message) => {
      const data = parse(message as MessageEvent);
      setProgress((current) => current && { ...current, total: data.total ?? null });
    });
    source.addEventListener('advanced', (message) => {
      const data = parse(message as MessageEvent);
      setProgress((current) => current && { ...current, done: data.done ?? current.done, total: data.total ?? null });
    });
    const finished = () => {
      setProgress(null);
      callbacks.current.onRunningChange?.(false);
      callbacks.current.onRunFinished();
      refresh();
    };
    source.addEventListener('run_finished', finished);
    source.addEventListener('run_failed', finished);
    return () => {
      closed = true;
      source.close();
    };
  }, []);

  if (!status) return null;
  const { scheduler, lastRun, demo } = status;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-stroke bg-white px-4 py-3 text-sm shadow-default dark:border-strokedark dark:bg-boxdark">
      {progress ? (
        <span className="flex items-center gap-2 font-medium text-black dark:text-white">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Đang chạy ({TRIGGER_LABELS[progress.trigger]}):{' '}
          {progress.total === null ? 'đang phát hiện vấn đề...' : `${progress.done}/${progress.total} đề xuất`}
        </span>
      ) : (
        <span className="text-body">{lastRunText(lastRun)}</span>
      )}
      <span className="text-body">
        Chạy tự động:{' '}
        {scheduler.enabled
          ? `mỗi ${Math.round((scheduler.intervalSeconds ?? 0) / 60)} phút, lần tới ${formatDateTime(scheduler.nextRunAt)}`
          : 'tắt (dùng nút "Chạy phát hiện ngay")'}
      </span>
      {!live && <span className="text-body">(không theo dõi trực tiếp được tiến trình)</span>}
      {demo.measureAfterMinutes !== null && (
        <span
          className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning"
          title="Chỉ dùng để trình diễn: kết quả được đo sau vài phút thay vì sau thời hạn của kế hoạch."
        >
          DEMO: đo kết quả sau {demo.measureAfterMinutes} phút
        </span>
      )}
    </div>
  );
};

const lastRunText = (lastRun: CiLastRun | null): string => {
  if (!lastRun) return 'Chưa có lượt chạy nào kể từ khi dịch vụ AI khởi động.';
  const when = `Lượt chạy gần nhất (${TRIGGER_LABELS[lastRun.trigger]}) lúc ${formatDateTime(lastRun.finishedAt)}`;
  if (lastRun.error) return `${when}: thất bại.`;
  return `${when}: ${lastRun.detected ?? 0} vấn đề mới, ${lastRun.advanced ?? 0} đề xuất được xử lý, ${
    lastRun.errors ?? 0
  } lỗi (${lastRun.seconds} giây).`;
};

export default RunStatusBar;
