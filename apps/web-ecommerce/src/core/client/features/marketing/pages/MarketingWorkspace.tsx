'use client';
import '../marketing-studio.css';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AdminIcon from '@/components/Admin/AdminIcon';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import AdminMarketingApi from '@/core/client/api/AdminMarketing';
import type {
  MarketingChannel,
  MarketingCopy,
  MarketingDraft,
  MarketingDraftInput,
  MarketingOptions,
} from '@/shared/types/admin-marketing';
import MarketingPreview, { type PreviewMedia } from '../components/MarketingPreview';
import AgentSuggestPopover from '../components/AgentSuggestPopover';

const CHANNELS: MarketingChannel[] = ['facebook', 'meta', 'google', 'tiktok'];
const GLYPHS: Record<MarketingChannel, string> = { facebook: 'f', meta: '∞', google: 'G', tiktok: '♪' };
const STATUS_TONE: Record<string, string> = {
  draft: 'muted',
  submitted: 'info',
  active: 'success',
  published: 'success',
  scheduled: 'info',
  paused: 'warning',
  ended: 'muted',
  reverted: 'muted',
  removed: 'muted',
  failed: 'danger',
};
const LIMITS = { name: 255, message: 5000, headline: 40, primaryText: 2000, adText: 100, linkPath: 500 };

const empty = (tone: string): MarketingDraftInput => ({
  name: '',
  channel: 'facebook',
  objective: 'traffic',
  brief: '',
  audience: '',
  tone,
  linkPath: '/cua-hang',
  sku: '',
  dailyBudgetVnd: 100000,
  durationDays: 7,
  message: '',
  headline: '',
  primaryText: '',
  headlines: [],
  descriptions: [],
  keywords: [],
  adText: '',
});
const localTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const draftStatus = (draft: MarketingDraft) =>
  draft.campaignStatus === 'ended'
    ? 'ended'
    : draft.adStatus || draft.postStatus || draft.campaignStatus || draft.status;

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={`mk-counter${value > max * 0.9 ? ' is-near' : ''}`}>{`${value}/${max}`}</span>;
}

// A labelled textarea with a live character or line counter.
function Area({
  label,
  value,
  onChange,
  maxLength,
  rows = 4,
  counter,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  counter?: React.ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="mk-field">
      <div className="mk-field-head">
        <label htmlFor={id} className="mk-label">
          {label}
        </label>
        {counter ?? (maxLength ? <Counter value={value.length} max={maxLength} /> : null)}
      </div>
      <textarea
        id={id}
        className="mk-input"
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default function MarketingWorkspace() {
  const t = useTranslations('marketingStudio'),
    locale = useLocale();
  const defaultTone = t('agent.tones.natural');
  const [input, setInput] = useState<MarketingDraftInput>(() => empty(defaultTone));
  const [selected, setSelected] = useState<MarketingDraft>();
  const [drafts, setDrafts] = useState<MarketingDraft[]>([]);
  const [options, setOptions] = useState<MarketingOptions>();
  const [suggestion, setSuggestion] = useState<MarketingCopy>();
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<'publish' | 'activate' | 'pause' | 'end'>();
  const [listOpen, setListOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const ids = {
    name: useId(),
    product: useId(),
    link: useId(),
    schedule: useId(),
    budget: useId(),
    days: useId(),
    headline: useId(),
  };

  const editable = !selected || selected.status === 'draft';
  const isPost = input.channel === 'facebook';
  const wantsVideo = input.channel === 'tiktok';
  const mode = options?.modes[input.channel];
  const total = isPost ? 0 : input.dailyBudgetVnd * input.durationDays;
  const schedule = isPost ? input.scheduledAt : input.startsAt;
  const money = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(value);
  const product = options?.products.find((item) => item.sku === input.sku);
  const assets = useMemo(
    () => (options?.assets || []).filter((asset) => asset.kind === (wantsVideo ? 'video' : 'image')),
    [options, wantsVideo],
  );
  const asset = options?.assets.find((item) => item.id === input.assetId);
  const media: PreviewMedia | undefined = asset
    ? { url: asset.url, kind: asset.kind }
    : !wantsVideo && product?.imageUrl
      ? { url: product.imageUrl, kind: 'image' }
      : undefined;
  const content = isPost
    ? input.message
    : input.channel === 'meta'
      ? input.primaryText
      : input.channel === 'google'
        ? input.descriptions.join('\n')
        : input.adText;

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, settings] = await Promise.all([AdminMarketingApi.list(), AdminMarketingApi.options()]);
    setFailed(!rows || !settings);
    if (rows) setDrafts(rows);
    if (settings) setOptions(settings);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!listOpen) return;
    const outside = (event: PointerEvent) => {
      if (!listRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setListOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [listOpen]);

  const update = <K extends keyof MarketingDraftInput>(key: K, value: MarketingDraftInput[K]) => {
    setInput((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setSuggestion(undefined);
  };
  // Picking a product points the landing link at its page, unless staff typed a custom link.
  const chooseProduct = (sku: string) => {
    const path = (item?: { id: number }) => (item ? `/shop/product/${item.id}` : '/cua-hang');
    const next = options?.products.find((item) => item.sku === sku);
    const automatic = input.linkPath === '/cua-hang' || input.linkPath === path(product);
    setInput((previous) => ({ ...previous, sku, ...(automatic ? { linkPath: path(next) } : {}) }));
    setDirty(true);
    setSuggestion(undefined);
  };
  const choose = (draft?: MarketingDraft, clone = false) => {
    if (dirty && !window.confirm(t('discardConfirm'))) return;
    setSelected(clone ? undefined : draft);
    setInput(
      draft
        ? {
            ...draft.input,
            ...(clone
              ? { name: t('copyName', { name: draft.input.name }), startsAt: undefined, scheduledAt: undefined }
              : {}),
          }
        : empty(defaultTone),
    );
    setDirty(clone);
    setSuggestion(undefined);
    setListOpen(false);
  };
  const save = async () => {
    const draft = await AdminMarketingApi.save(input, selected?.id);
    if (draft) {
      setSelected(draft);
      setDirty(false);
    }
    return draft;
  };
  const saveClick = async () => {
    setBusy(true);
    try {
      if (await save()) await load();
    } finally {
      setBusy(false);
    }
  };
  const suggest = async () => {
    setSuggesting(true);
    try {
      setSuggestion(await AdminMarketingApi.suggest(input));
    } finally {
      setSuggesting(false);
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const saved = await AdminMarketingApi.upload(file);
      if (saved) {
        setOptions((previous) => (previous ? { ...previous, assets: [saved, ...previous.assets] } : previous));
        update('assetId', saved.id);
      }
    } finally {
      setBusy(false);
    }
  };
  const confirmAction = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'publish') {
        const draft = selected && !dirty ? selected : await save();
        if (!draft) return;
        const sent = await AdminMarketingApi.publish(draft.id);
        if (!sent) return;
        setSelected(sent);
      } else if (!selected || !(await AdminMarketingApi.control(selected.id, confirm))) return;
      const rows = await AdminMarketingApi.list();
      if (rows) {
        setDrafts(rows);
        setSelected((previous) => rows.find((row) => row.id === previous?.id) ?? previous);
      }
      setConfirm(undefined);
    } finally {
      setBusy(false);
    }
  };
  const lines = (value: string[]) => value.join('\n');
  const toLines = (value: string) => value.split('\n');
  const filled = (value: string[]) => value.filter((line) => line.trim()).length;

  return (
    <div className="mk-studio">
      <Breadcrumb pageName="Marketing" />
      <div className="mk-toolbar">
        <div className="mk-toolbar-start">
          {mode && (
            <span role="status" className={`mk-mode is-${mode}`} title={t(`mode.${mode}Hint`)}>
              <span className="mk-dot" aria-hidden="true" />
              {t(`mode.${mode}`)}
            </span>
          )}
          {dirty && <span className="mk-unsaved">{t('unsaved')}</span>}
        </div>
        <div className="mk-toolbar-end">
          <div className="mk-campaigns" ref={listRef}>
            <button
              type="button"
              className="mk-button"
              aria-expanded={listOpen}
              aria-haspopup="true"
              onClick={() => setListOpen(!listOpen)}
            >
              <AdminIcon name="megaphone" size={16} />
              {t('campaigns', { count: drafts.length })}
            </button>
            {listOpen && (
              <div className="mk-campaigns-panel" role="dialog" aria-label={t('campaignsTitle')}>
                <strong className="mk-panel-title">{t('campaignsTitle')}</strong>
                {loading ? (
                  <p role="status" className="mk-hint">
                    {t('loading')}
                  </p>
                ) : !drafts.length ? (
                  <p className="mk-hint">{t('noCampaigns')}</p>
                ) : (
                  <ul>
                    {drafts.map((draft) => {
                      const status = draftStatus(draft);
                      return (
                        <li key={draft.id}>
                          <button
                            type="button"
                            disabled={busy}
                            aria-pressed={selected?.id === draft.id}
                            className="mk-campaign"
                            onClick={() => choose(draft)}
                          >
                            <span className={`mk-glyph is-${draft.input.channel}`} aria-hidden="true">
                              {GLYPHS[draft.input.channel]}
                            </span>
                            <span className="min-w-0">
                              <strong>{draft.input.name}</strong>
                              <small>
                                {t(`channels.${draft.input.channel}`)} ·{' '}
                                {new Date(draft.updatedAt).toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN')}
                              </small>
                            </span>
                            <span className={`mk-status is-${STATUS_TONE[status] || 'muted'}`}>
                              {t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button type="button" className="mk-button is-primary" disabled={busy} onClick={() => choose()}>
            {t('newCampaign')}
          </button>
        </div>
      </div>

      {failed && (
        <div role="alert" className="mk-alert">
          {t('loadFailed')}
          <button type="button" className="mk-button" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      )}

      <div className="mk-layout">
        <section className="mk-composer" aria-labelledby="mk-composer-title">
          <div className="mk-composer-head">
            <h2 id="mk-composer-title">{editable ? t('composeTitle') : input.name}</h2>
            {selected && (
              <span className={`mk-status is-${STATUS_TONE[draftStatus(selected)] || 'muted'}`}>
                {t.has(`statuses.${draftStatus(selected)}`)
                  ? t(`statuses.${draftStatus(selected)}`)
                  : draftStatus(selected)}
              </span>
            )}
          </div>
          <fieldset disabled={loading || busy || !editable} className="mk-fieldset">
            <div className="mk-field">
              <div className="mk-field-head">
                <label htmlFor={ids.name} className="mk-label">
                  {t('name')}
                </label>
                <Counter value={input.name.length} max={LIMITS.name} />
              </div>
              <input
                id={ids.name}
                className="mk-input mk-input-title"
                maxLength={LIMITS.name}
                placeholder={t('namePlaceholder')}
                value={input.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </div>

            <div className="mk-field">
              <span className="mk-label" id="mk-channel-label">
                {t('channel')}
              </span>
              <div className="mk-segments" role="radiogroup" aria-labelledby="mk-channel-label">
                {CHANNELS.map((channel) => (
                  <label key={channel} className="mk-segment" aria-label={t(`channels.${channel}`)}>
                    <input
                      type="radio"
                      name="mk-channel"
                      value={channel}
                      checked={input.channel === channel}
                      onChange={() => update('channel', channel)}
                    />
                    <span className={`mk-glyph is-${channel}`} aria-hidden="true">
                      {GLYPHS[channel]}
                    </span>
                    <span className="mk-segment-text" aria-hidden="true">
                      <strong>{t(`channelShort.${channel}`)}</strong>
                      <small>{t(`channelKind.${channel}`)}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mk-grid-2">
              <div className="mk-field">
                <label htmlFor={ids.product} className="mk-label">
                  {t('product')}
                </label>
                <select
                  id={ids.product}
                  className="mk-input"
                  value={input.sku}
                  onChange={(event) => chooseProduct(event.target.value)}
                >
                  <option value="">{t('noProduct')}</option>
                  {options?.products.map((item) => (
                    <option key={item.sku} value={item.sku}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mk-field">
                <label htmlFor={ids.link} className="mk-label">
                  {t('linkPath')}
                </label>
                <input
                  id={ids.link}
                  className="mk-input"
                  maxLength={LIMITS.linkPath}
                  value={input.linkPath}
                  onChange={(event) => update('linkPath', event.target.value)}
                />
              </div>
            </div>

            {!isPost && (
              <div className="mk-field">
                <span className="mk-label" id="mk-objective-label">
                  {t('objective')}
                </span>
                <div className="mk-pills" role="radiogroup" aria-labelledby="mk-objective-label">
                  {(['traffic', 'conversions'] as const).map((objective) => (
                    <label key={objective} className="mk-pill">
                      <input
                        type="radio"
                        name="mk-objective"
                        checked={input.objective === objective}
                        onChange={() => update('objective', objective)}
                      />
                      {t(`objectives.${objective}`)}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {input.channel !== 'google' && (
              <div className="mk-field">
                <div className="mk-field-head">
                  <span className="mk-label" id="mk-media-label">
                    {wantsVideo ? t('mediaVideo') : t('mediaImage')}
                  </span>
                  <span className="mk-hint">{wantsVideo ? t('mediaVideoHint') : t('mediaImageHint')}</span>
                </div>
                <div className="mk-media-strip" role="radiogroup" aria-labelledby="mk-media-label">
                  {!wantsVideo && product && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!input.assetId}
                      className="mk-thumb"
                      title={t('productPhoto')}
                      onClick={() => update('assetId', undefined)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote catalog images are shown unoptimized */}
                      <img src={product.imageUrl} alt="" />
                      <span className="mk-thumb-tag">{t('productPhoto')}</span>
                    </button>
                  )}
                  {assets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={input.assetId === item.id}
                      aria-label={item.title}
                      title={item.title}
                      className="mk-thumb"
                      onClick={() => update('assetId', input.assetId === item.id ? undefined : item.id)}
                    >
                      {item.kind === 'video' ? (
                        <video src={item.url} muted preload="metadata" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- uploaded marketing assets
                        <img src={item.url} alt="" />
                      )}
                    </button>
                  ))}
                  <button type="button" className="mk-thumb is-upload" onClick={() => uploadRef.current?.click()}>
                    <span aria-hidden="true">+</span>
                    <small>{t('upload')}</small>
                  </button>
                  <input
                    ref={uploadRef}
                    hidden
                    type="file"
                    aria-label={t('uploadLabel')}
                    accept={wantsVideo ? 'video/mp4' : 'image/jpeg,image/png,image/webp,image/gif'}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void upload(file);
                    }}
                  />
                </div>
                {!assets.length && !product && <p className="mk-hint">{t('noMedia')}</p>}
              </div>
            )}

            <div className="mk-content">
              <div className="mk-content-head">
                <h3>{t('content')}</h3>
                <AgentSuggestPopover
                  input={input}
                  suggestion={suggestion}
                  busy={suggesting}
                  disabled={loading || busy || !editable}
                  onChange={update}
                  onSuggest={() => void suggest()}
                  onApply={() => {
                    if (!suggestion) return;
                    setInput((previous) => ({ ...previous, ...suggestion }));
                    setDirty(true);
                    setSuggestion(undefined);
                  }}
                />
              </div>
              {isPost && (
                <Area
                  label={t('fields.message')}
                  value={input.message}
                  rows={6}
                  maxLength={LIMITS.message}
                  placeholder={t('fields.messagePlaceholder')}
                  onChange={(value) => update('message', value)}
                />
              )}
              {input.channel === 'meta' && (
                <>
                  <div className="mk-field">
                    <div className="mk-field-head">
                      <label htmlFor={ids.headline} className="mk-label">
                        {t('fields.headline')}
                      </label>
                      <Counter value={input.headline.length} max={LIMITS.headline} />
                    </div>
                    <input
                      id={ids.headline}
                      className="mk-input"
                      maxLength={LIMITS.headline}
                      value={input.headline}
                      onChange={(event) => update('headline', event.target.value)}
                    />
                  </div>
                  <Area
                    label={t('fields.primaryText')}
                    value={input.primaryText}
                    maxLength={LIMITS.primaryText}
                    onChange={(value) => update('primaryText', value)}
                  />
                </>
              )}
              {input.channel === 'google' && (
                <>
                  <Area
                    label={t('fields.headlines')}
                    value={lines(input.headlines)}
                    rows={5}
                    counter={
                      <span className="mk-counter">
                        {t('lineCount', { count: filled(input.headlines), min: 3, max: 15 })}
                      </span>
                    }
                    onChange={(value) => update('headlines', toLines(value))}
                  />
                  <Area
                    label={t('fields.descriptions')}
                    value={lines(input.descriptions)}
                    rows={3}
                    counter={
                      <span className="mk-counter">
                        {t('lineCount', { count: filled(input.descriptions), min: 2, max: 4 })}
                      </span>
                    }
                    onChange={(value) => update('descriptions', toLines(value))}
                  />
                  <Area
                    label={t('fields.keywords')}
                    value={lines(input.keywords)}
                    rows={3}
                    counter={<span className="mk-counter">{filled(input.keywords)}</span>}
                    onChange={(value) => update('keywords', toLines(value))}
                  />
                </>
              )}
              {input.channel === 'tiktok' && (
                <Area
                  label={t('fields.adText')}
                  value={input.adText}
                  rows={2}
                  maxLength={LIMITS.adText}
                  onChange={(value) => update('adText', value)}
                />
              )}
            </div>

            <div className="mk-schedule">
              <div className="mk-field">
                <div className="mk-field-head">
                  <label htmlFor={ids.schedule} className="mk-label">
                    {isPost ? t('schedule.publishAt') : t('schedule.startAt')}
                  </label>
                  {schedule && (
                    <button
                      type="button"
                      className="mk-link"
                      onClick={() => update(isPost ? 'scheduledAt' : 'startsAt', undefined)}
                    >
                      {t('schedule.clear')}
                    </button>
                  )}
                </div>
                <input
                  id={ids.schedule}
                  type="datetime-local"
                  className="mk-input"
                  value={localTime(schedule)}
                  onChange={(event) =>
                    update(
                      isPost ? 'scheduledAt' : 'startsAt',
                      event.target.value && Number.isFinite(new Date(event.target.value).getTime())
                        ? new Date(event.target.value).toISOString()
                        : undefined,
                    )
                  }
                />
              </div>
              {!isPost && (
                <>
                  <div className="mk-field">
                    <label htmlFor={ids.budget} className="mk-label">
                      {t('schedule.dailyBudget')}
                    </label>
                    <input
                      id={ids.budget}
                      type="number"
                      className="mk-input"
                      min={10000}
                      max={1000000000}
                      step={1000}
                      value={input.dailyBudgetVnd}
                      onChange={(event) => update('dailyBudgetVnd', Number(event.target.value))}
                    />
                  </div>
                  <div className="mk-field">
                    <label htmlFor={ids.days} className="mk-label">
                      {t('schedule.days')}
                    </label>
                    <input
                      id={ids.days}
                      type="number"
                      className="mk-input"
                      min={1}
                      max={30}
                      value={input.durationDays}
                      onChange={(event) => update('durationDays', Number(event.target.value))}
                    />
                  </div>
                </>
              )}
              <p className="mk-schedule-summary" aria-live="polite">
                <AdminIcon name="calendar" size={15} />
                <span>
                  {schedule
                    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
                        dateStyle: 'full',
                        timeStyle: 'short',
                      }).format(new Date(schedule))
                    : isPost
                      ? t('schedule.now')
                      : t('schedule.whenEnabled')}
                  {!isPost && (
                    <>
                      {' · '}
                      <strong>{t('schedule.total', { total: money(total) })}</strong>
                    </>
                  )}
                </span>
              </p>
            </div>
          </fieldset>

          <div className="mk-actionbar">
            {editable ? (
              <>
                <button
                  type="button"
                  className="mk-button"
                  disabled={busy || !input.name.trim()}
                  onClick={() => void saveClick()}
                >
                  {t('actions.save')}
                </button>
                <button
                  type="button"
                  className="mk-button is-primary"
                  disabled={busy || !options || !input.name.trim()}
                  onClick={() => setConfirm('publish')}
                >
                  {isPost ? (input.scheduledAt ? t('actions.schedule') : t('actions.publish')) : t('actions.createAd')}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="mk-button" disabled={busy} onClick={() => choose(selected, true)}>
                  {t('actions.clone')}
                </button>
                {selected?.adStatus === 'paused' && selected.campaignStatus !== 'ended' && (
                  <button
                    type="button"
                    className="mk-button is-primary"
                    disabled={busy}
                    onClick={() => setConfirm('activate')}
                  >
                    {t('actions.activate')}
                  </button>
                )}
                {selected?.adStatus === 'active' && (
                  <button type="button" className="mk-button" disabled={busy} onClick={() => setConfirm('pause')}>
                    {t('actions.pause')}
                  </button>
                )}
                {selected?.campaignStatus !== 'ended' && (
                  <button
                    type="button"
                    className="mk-button is-danger"
                    disabled={busy}
                    onClick={() => setConfirm('end')}
                  >
                    {t('actions.end')}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="mk-preview" aria-label={t('previewTitle')}>
          <div className="mk-preview-head">
            <span className={`mk-glyph is-${input.channel}`} aria-hidden="true">
              {GLYPHS[input.channel]}
            </span>
            <div>
              <strong>{t('previewTitle')}</strong>
              <small>{t(`channels.${input.channel}`)}</small>
            </div>
          </div>
          <div className={`mk-preview-stage is-${input.channel}`}>
            <MarketingPreview input={input} media={media} productName={product?.name} />
          </div>
          {!isPost && (
            <p className="mk-preview-budget">
              {t('budgetLine', { daily: money(input.dailyBudgetVnd), days: input.durationDays })}
            </p>
          )}
        </aside>
      </div>

      {confirm && (
        <div className="mk-modal-root">
          <section role="dialog" aria-modal="true" aria-labelledby="mk-confirm-title" className="mk-modal">
            <h2 id="mk-confirm-title">
              {confirm === 'publish'
                ? isPost
                  ? t('confirm.publishPost')
                  : t('confirm.createAd')
                : t(`confirm.${confirm}`)}
            </h2>
            <p className="mk-modal-meta">
              <span className={`mk-glyph is-${input.channel}`} aria-hidden="true">
                {GLYPHS[input.channel]}
              </span>
              {input.name} · {t(`channels.${input.channel}`)}
            </p>
            <p className="mk-modal-body">
              {confirm === 'publish'
                ? content || t('preview.emptyText')
                : confirm === 'activate'
                  ? t('confirm.activateBody', { daily: money(input.dailyBudgetVnd), total: money(total) })
                  : confirm === 'end'
                    ? t('confirm.endBody')
                    : t('confirm.pauseBody')}
            </p>
            {confirm === 'publish' && !isPost && (
              <p className="mk-modal-note">{t('confirm.createAdBody', { total: money(total) })}</p>
            )}
            <p className={`mk-modal-mode is-${mode}`}>{mode === 'fake' ? t('mode.fakeHint') : t('mode.liveHint')}</p>
            <div className="mk-modal-actions">
              <button type="button" className="mk-button" disabled={busy} onClick={() => setConfirm(undefined)}>
                {t('confirm.cancel')}
              </button>
              <button
                type="button"
                className="mk-button is-primary"
                disabled={busy}
                onClick={() => void confirmAction()}
              >
                {busy ? t('working') : t('confirm.ok')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
