'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';

import { useCart } from './CartProvider';
import { useCurrentUser } from './CurrentUserProvider';
import type {
  AssistantMessage,
  AssistantProgress,
  AssistantReply,
  AssistantStreamEvent,
} from '@/shared/types/customer-assistant';

class AssistantError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function readJson(response: Response): Promise<AssistantReply> {
  const envelope = await response.json().catch(() => ({}));
  if (!response.ok) throw new AssistantError(envelope.userMessages?.[0] || '', response.status);
  return envelope.data as AssistantReply;
}
// One JSON event per line: progress steps, then the reply or an error.
async function readStream(response: Response, onProgress: (step: AssistantProgress) => void): Promise<AssistantReply> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? '';
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop()!;
    for (const line of lines.filter((l) => l.trim())) {
      const event = JSON.parse(line) as AssistantStreamEvent;
      if (event.type === 'progress') {
        const { type: _type, ...step } = event;
        onProgress(step as AssistantProgress);
      }
      if (event.type === 'reply') return event.data;
      if (event.type === 'error') throw new AssistantError(event.message, event.status);
    }
    if (done) throw new AssistantError('', 503);
  }
}

const AssistantPanel = dynamic(() => import('@/components/CustomerAssistant/AssistantPanel'), { ssr: false });
type AssistantContextValue = {
  open: (prompt?: string) => void;
  close: () => void;
  messages: AssistantMessage[];
  busy: boolean;
  // What the assistant did so far in the running turn (streamed by the server), newest last.
  progress: AssistantProgress[];
  error: string;
  prompt: string;
  setPrompt: (value: string) => void;
  send: (text: string) => Promise<void>;
  clear: () => void;
  recordAction: (text: string) => void;
  epoch: number;
};
const Context = createContext<AssistantContextValue | null>(null);
export function CustomerAssistantProvider({ children }: { children: ReactNode }) {
  const locale = useLocale(),
    t = useTranslations('assistant');
  const pathname = usePathname();
  const { entries } = useCart();
  const { user, loading } = useCurrentUser();
  const [opened, setOpened] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const wasOpened = useRef(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AssistantProgress[]>([]);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [epoch, setEpoch] = useState(0);
  const identity = useRef<number | null | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const inFlight = useRef(false);
  const reset = () => {
    controller.current?.abort();
    controller.current = undefined;
    inFlight.current = false;
    setBusy(false);
    setMessages([]);
    setError('');
    setPrompt('');
    setEpoch((e) => e + 1);
  };
  useEffect(() => {
    if (loading || identity.current === (user?.id ?? null)) return;
    if (identity.current === undefined) {
      identity.current = user?.id ?? null;
      return;
    }
    identity.current = user?.id ?? null;
    reset();
    // Conversations stay in memory only and are cleared when the signed-in customer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    // The launcher is unmounted while the dialog is open; focus its new DOM node after closing.
    if (!opened && wasOpened.current && document.activeElement === document.body) launcher.current?.focus();
    wasOpened.current = opened;
  }, [opened]);
  const recordAction = (text: string) =>
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text }]);
  const send = async (text: string) => {
    const message = text.trim();
    if (!message || inFlight.current || message.length > 3000) return;
    const abort = new AbortController();
    controller.current = abort;
    inFlight.current = true;
    setBusy(true);
    setProgress([]);
    setError('');
    setPrompt('');
    const history = messages.slice(-12).map(({ role, text }) => ({ role, text }));
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }]);
    const timer = setTimeout(() => abort.abort(), 300000);
    try {
      // Fetch keeps model field names intact and displays errors inside the conversation (no repeated toasts).
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        // Progress lines while the reply is prepared; plain JSON still works (errors, older servers).
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          message,
          locale,
          history,
          path: pathname,
          cart: entries.map(({ item }) => ({ productId: item.productId, size: item.size, quantity: item.quantity })),
        }),
      });
      const reply = response.headers.get('content-type')?.includes('application/x-ndjson')
        ? await readStream(response, (step) => setProgress((current) => [...current, step]))
        : await readJson(response);
      if (!reply || typeof reply.answer !== 'string') throw new AssistantError(t('invalidReply'), 502);
      if (abort.signal.aborted) return;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: reply.answer, reply }]);
    } catch (failure) {
      if (controller.current === abort) {
        setError(
          abort.signal.aborted
            ? t('timeout')
            : failure instanceof AssistantError
              ? failure.status === 503 || !failure.message
                ? t('unavailable')
                : failure.message
              : t('unavailable'),
        );
        setPrompt(message);
      }
    } finally {
      clearTimeout(timer);
      if (controller.current === abort) {
        inFlight.current = false;
        setBusy(false);
        setProgress([]);
      }
    }
  };
  const visible = !pathname.startsWith('/admin') && !pathname.startsWith('/auth');
  const value: AssistantContextValue = {
    open: (text) => {
      if (text) setPrompt(text);
      setOpened(true);
    },
    close: () => setOpened(false),
    messages,
    busy,
    progress,
    error,
    prompt,
    setPrompt,
    send,
    clear: reset,
    recordAction,
    epoch,
  };
  return (
    <Context.Provider value={value}>
      {children}
      {visible && pathname !== '/assistant' && (
        <>
          {opened ? (
            <AssistantPanel key={epoch} />
          ) : (
            <button
              ref={launcher}
              className="agent-launcher"
              onClick={() => setOpened(true)}
              aria-label={t('open')}
              aria-haspopup="dialog"
            >
              <span aria-hidden="true" className="agent-spark">
                ✦
              </span>
              <span>
                <strong>{t('launcher')}</strong>
                <small>{t('launcherNote')}</small>
              </span>
            </button>
          )}
        </>
      )}
    </Context.Provider>
  );
}
export function useCustomerAssistant() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing CustomerAssistantProvider');
  return value;
}
