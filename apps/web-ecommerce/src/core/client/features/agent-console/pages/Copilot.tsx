'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { toast } from 'react-toastify';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import { inputClassName } from '@/components/FormElements/TextField';
import AgentServerApi, { ASSISTANT, agentServerUrl } from '@/core/client/api/AgentServer';
import { COPILOT_TOOLS, copilotRequest } from '@/shared/server/utils/CopilotToolUtils';
import type { CopilotThread, ToolApprovalRequest, ToolDecision } from '@/shared/types/agent';
import ActionView from '../components/ActionView';
import { fieldLabel, formatDateTime, parseFieldValue, showFieldValue } from '../components/agentLabels';

const MEMORY_TOOLS = ['write_file', 'edit_file'];
const DECISION_LABELS: Record<string, string> = { approve: 'Duyệt', edit: 'Sửa rồi duyệt', reject: 'Từ chối' };

const messageText = (message: Message) =>
  typeof message.content === 'string'
    ? message.content
    : message.content.map((part) => ('text' in part && typeof part.text === 'string' ? part.text : '')).join('');

interface Choice {
  type: 'approve' | 'edit' | 'reject';
  edits: Record<string, string>;
  note: string;
}

// The copilot's paused tool calls: a shop write is shown with the inbox's renderer and may be edited in its
// editable fields; a memory note is shown as written. One decision per call, sent together.
const ApprovalCard = ({
  request,
  busy,
  onDecide,
}: {
  request: ToolApprovalRequest;
  busy: boolean;
  onDecide: (decisions: ToolDecision[]) => Promise<void>;
}) => {
  const [choices, setChoices] = useState<Choice[]>(() =>
    request.action_requests.map(() => ({ type: 'approve', edits: {}, note: '' })),
  );
  const update = (index: number, change: Partial<Choice>) =>
    setChoices((current) => current.map((choice, i) => (i === index ? { ...choice, ...change } : choice)));

  const submit = async () => {
    const decisions: ToolDecision[] = [];
    for (const [i, choice] of choices.entries()) {
      if (choice.type === 'reject') {
        decisions.push(choice.note.trim() ? { type: 'reject', note: choice.note.trim() } : { type: 'reject' });
        continue;
      }
      if (choice.type === 'approve') {
        decisions.push({ type: 'approve' });
        continue;
      }
      const args = request.action_requests[i].args;
      const edited: Record<string, unknown> = {};
      for (const [field, raw] of Object.entries(choice.edits)) {
        const value = parseFieldValue(raw, args[field], field);
        if (typeof value === 'number' && !Number.isFinite(value)) {
          toast.error(`${fieldLabel(field)} phải là một số.`);
          return;
        }
        edited[field] = value;
      }
      decisions.push({ type: 'edit', args: edited });
    }
    await onDecide(decisions);
  };

  return (
    <div className="rounded-sm border border-warning bg-warning/5 p-4">
      <h3 className="mb-3 font-semibold text-black dark:text-white">Trợ lý cần bạn duyệt trước khi thực hiện</h3>
      <ol className="flex flex-col gap-4">
        {request.action_requests.map((action, i) => {
          const tool = COPILOT_TOOLS[action.name];
          const choice = choices[i];
          const allowed = (request.review_configs[i]?.allowed_decisions ?? []).filter(
            (type) => type in DECISION_LABELS && (type !== 'edit' || (tool && tool.editable.length > 0)),
          );
          return (
            <li key={`${action.name}-${i}`} className="rounded border border-stroke p-3 dark:border-strokedark">
              <p className="mb-1 font-medium text-black dark:text-white">{action.description || action.name}</p>
              {tool ? (
                <ul>
                  <ActionView
                    action={{
                      action_id: '',
                      type: action.name,
                      endpoint: '',
                      body: copilotRequest(action.name, action.args)?.body ?? {},
                      idempotency_key: '',
                      description: action.description ?? action.name,
                      editable_fields: tool.editable,
                    }}
                  />
                </ul>
              ) : MEMORY_TOOLS.includes(action.name) ? (
                <pre className="whitespace-pre-wrap rounded bg-gray-2 p-2 text-sm dark:bg-meta-4">
                  Ghi nhớ: {String(action.args.content ?? action.args.new_string ?? '')}
                </pre>
              ) : (
                <code className="break-all text-xs text-body">{JSON.stringify(action.args)}</code>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                {allowed.map((type) => (
                  <label key={type} className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={choice.type === type}
                      onChange={() => update(i, { type: type as Choice['type'] })}
                    />
                    {DECISION_LABELS[type]}
                  </label>
                ))}
              </div>
              {choice.type === 'edit' &&
                tool?.editable.map((field) => {
                  const original = action.args[field];
                  const value = choice.edits[field] ?? showFieldValue(original);
                  const multiline = Array.isArray(original) || field === 'message' || field === 'description';
                  const onChange = (raw: string) => update(i, { edits: { ...choice.edits, [field]: raw } });
                  return (
                    <label key={field} className="mt-2 block text-sm">
                      {fieldLabel(field)}
                      {multiline ? (
                        <textarea
                          className={inputClassName}
                          rows={3}
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                        />
                      ) : (
                        <input className={inputClassName} value={value} onChange={(e) => onChange(e.target.value)} />
                      )}
                    </label>
                  );
                })}
              {choice.type === 'reject' && (
                <input
                  className={`${inputClassName} mt-2`}
                  placeholder="Lý do (không bắt buộc)"
                  value={choice.note}
                  onChange={(e) => update(i, { note: e.target.value })}
                />
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="mt-4 rounded bg-primary px-4 py-2 font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
      >
        Gửi quyết định
      </button>
    </div>
  );
};

const Chat = ({
  apiUrl,
  threadId,
  onThreadId,
  onFinish,
}: {
  apiUrl: string;
  threadId: string | null;
  onThreadId: (threadId: string) => void;
  onFinish: () => void;
}) => {
  const [draft, setDraft] = useState('');
  const stream = useStream<{ messages: Message[] }>({
    apiUrl,
    apiKey: null,
    assistantId: ASSISTANT,
    threadId,
    onThreadId,
    messagesKey: 'messages',
    onFinish,
    onError: () => toast.error('Trợ lý gặp lỗi, vui lòng thử lại.'),
  });
  const request = stream.interrupt?.value as ToolApprovalRequest | undefined;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || stream.isLoading) return;
    setDraft('');
    await stream.submit({ messages: [{ type: 'human', content }] });
  };
  const decide = (decisions: ToolDecision[]) => stream.submit(null, { command: { resume: { decisions } } });

  return (
    <div className="flex min-h-[60vh] flex-col rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {stream.messages.length === 0 && (
          <p className="text-sm text-body">
            Hỏi về doanh thu, tồn kho, khuyến mãi, quảng cáo hay thị trường; hoặc nhờ trợ lý tạo mã giảm giá, bài đăng,
            công việc cho nhân viên. Mọi thay đổi đều chờ bạn duyệt.
          </p>
        )}
        {stream.messages.map((message, i) => {
          if (message.type !== 'human' && message.type !== 'ai') return null;
          const text = messageText(message);
          const tools = message.type === 'ai' ? (message.tool_calls ?? []).map((call) => call.name) : [];
          if (!text && tools.length === 0) return null;
          const mine = message.type === 'human';
          return (
            <div key={message.id ?? i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                  mine ? 'bg-primary text-white' : 'bg-gray-2 text-black dark:bg-meta-4 dark:text-white'
                }`}
              >
                {text && <p className="whitespace-pre-line">{text}</p>}
                {tools.length > 0 && <p className="mt-1 text-xs italic opacity-70">Đang dùng: {tools.join(', ')}</p>}
              </div>
            </div>
          );
        })}
        {stream.isLoading && !request && <p className="text-sm text-body">Trợ lý đang trả lời…</p>}
        {request && (
          <ApprovalCard key={stream.messages.length} request={request} busy={stream.isLoading} onDecide={decide} />
        )}
      </div>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          className={inputClassName}
          placeholder="Nhập câu hỏi hoặc yêu cầu…"
          value={draft}
          disabled={Boolean(request)}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          disabled={stream.isLoading || Boolean(request) || !draft.trim()}
          className="rounded bg-primary px-4 py-2 font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
        >
          Gửi
        </button>
      </form>
    </div>
  );
};

// The copilot (docs/ARCHITECTURE.md section 6.3): chats and the daily briefings, with inline approvals.
const Copilot = () => {
  const [apiUrl, setApiUrl] = useState<string | null>(null); // the gateway's absolute URL, known in the browser only
  const [threads, setThreads] = useState<CopilotThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);

  const load = useCallback(async () => setThreads((await AgentServerApi.listCopilotThreads()) ?? []), []);
  useEffect(() => {
    setApiUrl(agentServerUrl());
    load();
  }, [load]);

  return (
    <>
      <Breadcrumb pageName="Trợ lý AI" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <aside className="rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <button
            type="button"
            onClick={() => setThreadId(null)}
            className="mb-3 w-full rounded border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
          >
            Cuộc trò chuyện mới
          </button>
          <ul className="flex flex-col gap-1 text-sm">
            {threads.map((thread) => (
              <li key={thread.threadId}>
                <button
                  type="button"
                  onClick={() => setThreadId(thread.threadId)}
                  className={`w-full rounded px-2 py-1 text-left hover:bg-gray-2 dark:hover:bg-meta-4 ${
                    thread.threadId === threadId ? 'bg-gray-2 dark:bg-meta-4' : ''
                  }`}
                >
                  {thread.briefing ? 'Bản tin hằng ngày' : 'Trò chuyện'}
                  {thread.waiting && <span className="ml-1 text-warning">• chờ duyệt</span>}
                  <span className="block text-xs text-body">{formatDateTime(thread.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="lg:col-span-3">
          {apiUrl && <Chat apiUrl={apiUrl} threadId={threadId} onThreadId={setThreadId} onFinish={load} />}
        </div>
      </div>
    </>
  );
};

export default Copilot;
