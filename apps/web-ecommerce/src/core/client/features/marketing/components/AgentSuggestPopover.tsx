'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import type { MarketingCopy, MarketingDraftInput } from '@/shared/types/admin-marketing';

const TONES = ['natural', 'excited', 'premium', 'friendly', 'playful'] as const;

// The suggestion text for the current channel only, as it would be applied to the draft.
const copyFor = (channel: MarketingDraftInput['channel'], copy: MarketingCopy) =>
  channel === 'facebook'
    ? copy.message
    : channel === 'meta'
      ? [copy.headline, copy.primaryText].filter(Boolean).join('\n\n')
      : channel === 'google'
        ? [...copy.headlines, '', ...copy.descriptions].join('\n').trim()
        : copy.adText;

// A compact popover next to the content field: brief in, suggestion out, apply with one click. The Agent never
// writes into the draft by itself; the admin applies and then edits.
export default function AgentSuggestPopover({
  input,
  suggestion,
  busy,
  disabled,
  onChange,
  onSuggest,
  onApply,
}: {
  input: MarketingDraftInput;
  suggestion?: MarketingCopy;
  busy: boolean;
  disabled: boolean;
  onChange: <K extends 'brief' | 'audience' | 'tone'>(key: K, value: MarketingDraftInput[K]) => void;
  onSuggest: () => void;
  onApply: () => void;
}) {
  const t = useTranslations('marketingStudio.agent');
  const [open, setOpen] = useState(false),
    [upward, setUpward] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId(),
    briefId = useId(),
    audienceId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const toneLabels = TONES.map((tone) => t(`tones.${tone}`));
  const missingName = !input.name.trim();
  return (
    <div className="mk-agent" ref={root}>
      <button
        type="button"
        className="mk-agent-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={(event) => {
          // Open upward when the panel would run past the bottom of the viewport.
          const rect = event.currentTarget.getBoundingClientRect();
          setUpward(rect.bottom + 440 > innerHeight && rect.top > 440);
          setOpen(!open);
        }}
      >
        <AdminIcon name="spark" size={15} />
        {t('trigger')}
      </button>
      {open && (
        <div id={panelId} className={`mk-agent-panel${upward ? ' is-up' : ''}`} role="dialog" aria-label={t('title')}>
          <div className="mk-agent-head">
            <strong>{t('title')}</strong>
            <button type="button" className="mk-icon-button" aria-label={t('close')} onClick={() => setOpen(false)}>
              <AdminIcon name="close" size={14} />
            </button>
          </div>
          <label htmlFor={briefId} className="mk-label">
            {t('brief')}
          </label>
          <textarea
            id={briefId}
            className="mk-input"
            rows={3}
            maxLength={3000}
            placeholder={t('briefPlaceholder')}
            value={input.brief}
            onChange={(event) => onChange('brief', event.target.value)}
          />
          <label htmlFor={audienceId} className="mk-label">
            {t('audience')}
          </label>
          <input
            id={audienceId}
            className="mk-input"
            maxLength={1000}
            placeholder={t('audiencePlaceholder')}
            value={input.audience}
            onChange={(event) => onChange('audience', event.target.value)}
          />
          <span className="mk-label">{t('tone')}</span>
          <div className="mk-chips" role="group" aria-label={t('tone')}>
            {toneLabels.map((label) => (
              <button
                key={label}
                type="button"
                className="mk-chip"
                aria-pressed={input.tone === label}
                onClick={() => onChange('tone', label)}
              >
                {label}
              </button>
            ))}
          </div>
          {missingName && <p className="mk-hint">{t('needName')}</p>}
          <button
            type="button"
            className="mk-button is-primary mk-agent-run"
            disabled={busy || missingName || !input.brief.trim()}
            onClick={onSuggest}
          >
            <AdminIcon name="spark" size={15} />
            {busy ? t('working') : suggestion ? t('regenerate') : t('run')}
          </button>
          {suggestion && (
            <div className="mk-agent-result" aria-live="polite">
              <span className="mk-label">{t('result')}</span>
              <p>{copyFor(input.channel, suggestion) || t('emptyResult')}</p>
              <button
                type="button"
                className="mk-button is-primary"
                onClick={() => {
                  onApply();
                  setOpen(false);
                }}
              >
                {t('apply')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
