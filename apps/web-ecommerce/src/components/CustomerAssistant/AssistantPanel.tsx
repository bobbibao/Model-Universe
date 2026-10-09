'use client';

import { useLayoutEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';
import AssistantConversation from './AssistantConversation';

export default function AssistantPanel() {
  const agent = useCustomerAssistant();
  const t = useTranslations('assistant');
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(agent.close);
  close.current = agent.close;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = panel.current;
    el?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    const oldOverflow = document.body.style.overflow;
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    if (mobile) document.body.style.overflow = 'hidden';
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab' || !el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, summary'),
      ).filter((item) => item.getClientRects().length > 0);
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    el?.addEventListener('keydown', keydown);
    return () => {
      el?.removeEventListener('keydown', keydown);
      if (mobile) document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <>
      <div className="agent-backdrop" onClick={agent.close} aria-hidden="true" />
      <div
        ref={panel}
        className="customer-agent agent-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-agent-title"
      >
        <header className="agent-panel-header">
          <div className="agent-avatar" aria-hidden="true">
            ✦
          </div>
          <div>
            <h2 id="customer-agent-title">{t('name')}</h2>
            <p>{t('panelNote')}</p>
          </div>
          <Link href="/assistant" onClick={agent.close} title={t('openWorkspace')} aria-label={t('openWorkspace')}>
            ↗
          </Link>
          <button onClick={agent.close} aria-label={t('closePanel')}>
            ×
          </button>
        </header>
        <AssistantConversation />
      </div>
    </>
  );
}
