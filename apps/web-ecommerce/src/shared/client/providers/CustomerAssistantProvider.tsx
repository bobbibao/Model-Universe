'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';

import { useCart } from './CartProvider';
import { useCurrentUser } from './CurrentUserProvider';
import type { AssistantMessage, AssistantReply } from '@/shared/types/customer-assistant';

const AssistantPanel = dynamic(() => import('@/components/CustomerAssistant/AssistantPanel'), { ssr: false });
type AssistantContextValue = {
  open: (prompt?: string, research?: boolean) => void;
  close: () => void;
  messages: AssistantMessage[];
  busy: boolean;
  error: string;
  research: boolean;
  setResearch: (value: boolean) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  send: (text: string) => Promise<void>;
  clear: () => void;
  recordAction: (text: string) => void;
  epoch: number;
};
const Context = createContext<AssistantContextValue | null>(null);
export function CustomerAssistantProvider({ children }: { children: ReactNode }) {
  const locale = useLocale(), t = useTranslations('assistant');
  const pathname = usePathname();
  const { entries } = useCart();
  const { user, loading } = useCurrentUser();
  const [opened, setOpened] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [research, setResearch] = useState(false);
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
  const recordAction = (text: string) =>
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text }]);
  const send = async (text: string) => {
    const message = text.trim();
    if (!message || inFlight.current || message.length > 3000) return;
    const abort = new AbortController();
    controller.current = abort;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setPrompt('');
    const history = messages.slice(-12).map(({ role, text }) => ({ role, text }));
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }]);
    const timer = setTimeout(() => abort.abort(), 300000);
    try {
      // Fetch keeps model field names intact and displays errors inside the conversation (no repeated toasts).
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          message,
          locale,
          history,
          research,
          path: pathname,
          cart: entries.map(({ item }) => ({ productId: item.productId, size: item.size, quantity: item.quantity })),
        }),
      });
      const envelope = await response.json();
      if (!response.ok) throw new Error(response.status === 503 ? t('unavailable') : envelope.userMessages?.[0] || t('unavailable'));
      const reply = envelope.data as AssistantReply;
      if (!reply || typeof reply.answer !== 'string') throw new Error(t('invalidReply'));
      if (abort.signal.aborted) return;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: reply.answer, reply }]);
    } catch (failure) {
      if (controller.current === abort) {
        setError(
          abort.signal.aborted
            ? t('timeout')
            : failure instanceof Error
              ? failure.message
              : t('unavailable'),
        );
        setPrompt(message);
      }
    } finally {
      clearTimeout(timer);
      if (controller.current === abort) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const visible = !pathname.startsWith('/admin') && !pathname.startsWith('/auth');
  const value: AssistantContextValue = {
    open: (text, deep) => {
      if (text) setPrompt(text);
      if (deep !== undefined) setResearch(deep);
      setOpened(true);
    },
    close: () => setOpened(false),
    messages,
    busy,
    error,
    research,
    setResearch,
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
