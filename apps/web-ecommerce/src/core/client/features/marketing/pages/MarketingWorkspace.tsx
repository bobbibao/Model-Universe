'use client';
import { useCallback, useEffect, useId, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import TextField, { inputClassName } from '@/components/FormElements/TextField';
import AdminMarketingApi from '@/core/client/api/AdminMarketing';
import type {
  MarketingCopy,
  MarketingDraft,
  MarketingDraftInput,
  MarketingOptions,
  MarketingChannel,
} from '@/shared/types/admin-marketing';

const CHANNELS: Record<MarketingChannel, string> = {
  facebook: 'Bài post Facebook',
  meta: 'Quảng cáo Facebook / Instagram',
  google: 'Quảng cáo Google Search',
  tiktok: 'Quảng cáo TikTok',
};
const STATUSES: Record<string, string> = {
  draft: 'Bản nháp',
  submitted: 'Đã gửi',
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  ended: 'Đã kết thúc',
  reverted: 'Đã thu hồi',
  published: 'Đã đăng',
  scheduled: 'Hẹn giờ đăng',
  removed: 'Đã hủy bài post',
  failed: 'Đăng thất bại',
};
const empty = (): MarketingDraftInput => ({
  name: '',
  channel: 'facebook',
  objective: 'traffic',
  brief: '',
  audience: '',
  tone: 'Tự nhiên, rõ ràng',
  linkPath: '/shop',
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
const button =
  'rounded border border-stroke px-4 py-2 text-sm font-semibold hover:bg-gray disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4';
const primary =
  'rounded bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50';
const card = 'min-w-0 rounded border border-stroke bg-white p-5 dark:border-strokedark dark:bg-boxdark';
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const localTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function Area({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="text-sm font-medium">
      <label htmlFor={id} className="mb-2 block">
        {label}
      </label>
      <textarea
        id={id}
        className={inputClassName}
        rows={4}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export default function MarketingWorkspace() {
  const [input, setInput] = useState<MarketingDraftInput>(empty);
  const [selected, setSelected] = useState<MarketingDraft>();
  const [drafts, setDrafts] = useState<MarketingDraft[]>([]);
  const [options, setOptions] = useState<MarketingOptions>();
  const [suggestion, setSuggestion] = useState<MarketingCopy>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<'publish' | 'activate' | 'pause' | 'end'>();
  const editable = !selected || selected.status === 'draft';
  const isPost = input.channel === 'facebook';
  const mode = options?.modes[input.channel];
  const total = isPost ? 0 : input.dailyBudgetVnd * input.durationDays;
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
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const update = <K extends keyof MarketingDraftInput>(key: K, value: MarketingDraftInput[K]) => {
    setInput((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setSuggestion(undefined);
  };
  const choose = (draft?: MarketingDraft, clone = false) => {
    if (dirty && !window.confirm('Bản nháp chưa lưu. Bỏ các thay đổi để mở chiến dịch khác?')) return;
    setSelected(clone ? undefined : draft);
    setInput(
      draft
        ? {
            ...draft.input,
            ...(clone ? { name: `${draft.input.name} (bản sao)`, startsAt: undefined, scheduledAt: undefined } : {}),
          }
        : empty(),
    );
    setDirty(clone);
    setSuggestion(undefined);
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
    setBusy(true);
    try {
      setSuggestion(await AdminMarketingApi.suggest(input));
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
  const field = (key: 'name' | 'audience' | 'tone' | 'linkPath' | 'headline', label: string, maxLength?: number) => (
    <TextField
      key={key}
      label={label}
      name={key}
      value={input[key]}
      maxLength={maxLength}
      onChange={(e) => update(key, e.target.value)}
    />
  );
  return (
    <>
      <Breadcrumb pageName="Marketing" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-body">
          Admin tự tạo chiến dịch, nhờ Agent gợi ý và chỉnh sửa nội dung trước khi đăng bài hoặc chạy quảng cáo.
        </p>
        <button className={button} disabled={busy} onClick={() => choose()}>
          + Chiến dịch mới
        </button>
      </div>
      {failed && (
        <div role="alert" className="mb-4 rounded border border-danger p-4">
          Chưa tải được dữ liệu marketing.{' '}
          <button className={button} onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section className={card}>
          <h2 className="mb-4 text-xl font-semibold">{editable ? 'Soạn chiến dịch' : input.name}</h2>
          {mode && (
            <p
              role="status"
              className={`mb-5 rounded p-3 text-sm ${mode === 'fake' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}
            >
              {mode === 'fake'
                ? 'Chế độ mô phỏng: không gửi lên nền tảng thật, không phát sinh chi phí quảng cáo.'
                : 'Đang kết nối nền tảng thật. Đăng bài và bật quảng cáo sẽ thực hiện trên tài khoản đã kết nối.'}
            </p>
          )}
          <fieldset disabled={loading || busy || !editable} className="space-y-5 disabled:opacity-75">
            {field('name', 'Tên chiến dịch', 255)}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">
                Kênh marketing
                <select
                  aria-label="Kênh marketing"
                  className={`${inputClassName} mt-2`}
                  value={input.channel}
                  onChange={(e) => update('channel', e.target.value as MarketingChannel)}
                >
                  {Object.entries(CHANNELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {!isPost && (
                <label className="text-sm font-medium">
                  Mục tiêu
                  <select
                    aria-label="Mục tiêu"
                    className={`${inputClassName} mt-2`}
                    value={input.objective}
                    onChange={(e) => update('objective', e.target.value as MarketingDraftInput['objective'])}
                  >
                    <option value="traffic">Lượt truy cập</option>
                    <option value="conversions">Chuyển đổi / mua hàng</option>
                  </select>
                </label>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">
                Sản phẩm
                <select
                  aria-label="Sản phẩm marketing"
                  className={`${inputClassName} mt-2`}
                  value={input.sku}
                  onChange={(e) => update('sku', e.target.value)}
                >
                  <option value="">Không chọn sản phẩm</option>
                  {options?.products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </label>
              {field('linkPath', 'Đường dẫn trang đích', 500)}
            </div>
            {input.channel !== 'google' && (
              <label className="block text-sm font-medium">
                {input.channel === 'tiktok' ? 'Video quảng cáo' : 'Ảnh bài post / quảng cáo'}
                <select
                  aria-label="Tư liệu marketing"
                  className={`${inputClassName} mt-2`}
                  value={input.assetId ?? ''}
                  onChange={(e) => update('assetId', e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">
                    {input.channel === 'tiktok' ? 'Chọn video từ thư viện' : 'Dùng ảnh sản phẩm nếu đã chọn'}
                  </option>
                  {options?.assets
                    .filter((a) => a.kind === (input.channel === 'tiktok' ? 'video' : 'image'))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {input.channel !== 'google' && (
              <label className="block text-sm font-medium">
                Tải ảnh / video mới (tối đa 50MB)
                <input
                  aria-label="Tải tư liệu marketing"
                  className={`${inputClassName} mt-2`}
                  type="file"
                  accept={input.channel === 'tiktok' ? 'video/mp4' : 'image/jpeg,image/png,image/webp,image/gif'}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    setBusy(true);
                    try {
                      const asset = await AdminMarketingApi.upload(file);
                      if (asset) {
                        setOptions((previous) =>
                          previous ? { ...previous, assets: [asset, ...previous.assets] } : previous,
                        );
                        update('assetId', asset.id);
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
            )}
            <details open className="rounded border border-stroke p-4 dark:border-strokedark">
              <summary className="cursor-pointer font-semibold">Gợi ý nội dung từ Agent</summary>
              <div className="mt-4 space-y-4">
                <Area
                  label="Yêu cầu nội dung"
                  value={input.brief}
                  maxLength={3000}
                  onChange={(v) => update('brief', v)}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  {field('audience', 'Đối tượng khách hàng', 1000)}
                  {field('tone', 'Giọng điệu', 300)}
                </div>
                <button
                  className={button}
                  disabled={!input.name.trim() || !input.brief.trim()}
                  onClick={() => void suggest()}
                >
                  {busy ? 'Đang xử lý…' : 'Nhờ Agent gợi ý'}
                </button>
                {suggestion && (
                  <div className="rounded bg-gray p-4 dark:bg-meta-4">
                    <p className="mb-2 font-semibold">Nội dung Agent gợi ý</p>
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {[
                        suggestion.message,
                        suggestion.headline,
                        suggestion.primaryText,
                        ...suggestion.headlines,
                        ...suggestion.descriptions,
                        suggestion.adText,
                        suggestion.keywords.join(', '),
                      ]
                        .filter(Boolean)
                        .join('\n\n')}
                    </pre>
                    <button
                      className={`${primary} mt-4`}
                      onClick={() => {
                        setInput((p) => ({ ...p, ...suggestion }));
                        setDirty(true);
                        setSuggestion(undefined);
                      }}
                    >
                      Dùng gợi ý để chỉnh sửa
                    </button>
                  </div>
                )}
              </div>
            </details>
            <h3 className="font-semibold">Nội dung sẽ gửi</h3>
            {isPost && (
              <Area
                label="Nội dung bài post"
                value={input.message}
                maxLength={5000}
                onChange={(v) => update('message', v)}
              />
            )}
            {input.channel === 'meta' && (
              <>
                {field('headline', 'Tiêu đề quảng cáo (tối đa 40 ký tự)', 40)}
                <Area
                  label="Nội dung quảng cáo"
                  value={input.primaryText}
                  maxLength={2000}
                  onChange={(v) => update('primaryText', v)}
                />
              </>
            )}
            {input.channel === 'google' && (
              <>
                <Area
                  label="Tiêu đề (3–15 dòng, tối đa 30 ký tự/dòng)"
                  value={input.headlines.join('\n')}
                  onChange={(v) => update('headlines', v.split('\n'))}
                />
                <Area
                  label="Mô tả (2–4 dòng, tối đa 90 ký tự/dòng)"
                  value={input.descriptions.join('\n')}
                  onChange={(v) => update('descriptions', v.split('\n'))}
                />
                <Area
                  label="Từ khóa (mỗi dòng một từ khóa)"
                  value={input.keywords.join('\n')}
                  onChange={(v) => update('keywords', v.split('\n'))}
                />
              </>
            )}
            {input.channel === 'tiktok' && (
              <Area
                label="Nội dung quảng cáo TikTok (tối đa 100 ký tự)"
                value={input.adText}
                maxLength={100}
                onChange={(v) => update('adText', v)}
              />
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label={isPost ? 'Hẹn giờ đăng (để trống để đăng ngay)' : 'Bắt đầu (để trống để bắt đầu khi bật)'}
                name="schedule"
                type="datetime-local"
                value={localTime(isPost ? input.scheduledAt : input.startsAt)}
                onChange={(e) =>
                  update(
                    isPost ? 'scheduledAt' : 'startsAt',
                    e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  )
                }
              />
              {!isPost && (
                <TextField
                  label="Ngân sách mỗi ngày (VND)"
                  name="dailyBudgetVnd"
                  type="number"
                  min={10000}
                  max={1000000000}
                  step={1000}
                  value={input.dailyBudgetVnd}
                  onChange={(e) => update('dailyBudgetVnd', Number(e.target.value))}
                />
              )}
            </div>
            {!isPost && (
              <>
                <TextField
                  label="Số ngày chạy"
                  name="durationDays"
                  type="number"
                  min={1}
                  max={30}
                  value={input.durationDays}
                  onChange={(e) => update('durationDays', Number(e.target.value))}
                />
                <p className="text-sm text-body">
                  Tổng ngân sách dự kiến: <strong>{money(total)}</strong>. Dùng hạn mức ngân sách marketing chung của
                  cửa hàng.
                </p>
              </>
            )}
          </fieldset>
          <div className="mt-6 flex flex-wrap gap-3">
            {editable ? (
              <>
                <button className={button} disabled={busy || !input.name.trim()} onClick={() => void saveClick()}>
                  Lưu bản nháp
                </button>
                <button
                  className={primary}
                  disabled={busy || !options || !input.name.trim()}
                  onClick={() => setConfirm('publish')}
                >
                  {isPost ? (input.scheduledAt ? 'Hẹn giờ đăng bài' : 'Đăng bài') : 'Tạo quảng cáo tạm dừng'}
                </button>
              </>
            ) : (
              <>
                <button className={button} disabled={busy} onClick={() => choose(selected, true)}>
                  Tạo bản sao để chỉnh sửa
                </button>
                {selected?.adStatus === 'paused' && selected.campaignStatus !== 'ended' && (
                  <button className={primary} disabled={busy} onClick={() => setConfirm('activate')}>
                    Bật chạy quảng cáo
                  </button>
                )}
                {selected?.adStatus === 'active' && (
                  <button className={button} disabled={busy} onClick={() => setConfirm('pause')}>
                    Tạm dừng quảng cáo
                  </button>
                )}
                {selected?.campaignStatus !== 'ended' && (
                  <button className={button} disabled={busy} onClick={() => setConfirm('end')}>
                    Kết thúc chiến dịch
                  </button>
                )}
              </>
            )}
          </div>
          {dirty && <p className="mt-3 text-xs text-warning">Có thay đổi chưa lưu.</p>}
        </section>
        <aside className="min-w-0 space-y-5">
          <section className={card}>
            <h2 className="mb-4 font-semibold">Xem trước nội dung</h2>
            <p className="mb-3 text-xs text-body">{CHANNELS[input.channel]}</p>
            <h3 className="mb-3 font-semibold">
              {(input.channel === 'meta'
                ? input.headline
                : input.channel === 'google'
                  ? input.headlines[0]
                  : input.name) || 'Tên chiến dịch'}
            </h3>
            <p className="whitespace-pre-wrap break-words text-sm">{content || 'Nội dung sẽ xuất hiện ở đây.'}</p>
            <p className="mt-4 break-all text-xs text-body">{input.linkPath}</p>
            {!isPost && (
              <p className="mt-3 text-sm">
                {money(input.dailyBudgetVnd)} / ngày · {input.durationDays} ngày
              </p>
            )}
          </section>
          <section className={card}>
            <h2 className="mb-4 font-semibold">Chiến dịch của admin</h2>
            {loading ? (
              <p role="status">Đang tải…</p>
            ) : !drafts.length ? (
              <p className="text-sm text-body">Chưa có chiến dịch. Bắt đầu bằng bản nháp bên trái.</p>
            ) : (
              <ul className="max-h-[650px] space-y-2 overflow-y-auto">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <button
                      disabled={busy}
                      aria-pressed={selected?.id === d.id}
                      className={`w-full rounded border p-3 text-left ${selected?.id === d.id ? 'border-brand' : 'border-stroke dark:border-strokedark'}`}
                      onClick={() => choose(d)}
                    >
                      <span className="block font-medium">{d.input.name}</span>
                      <span className="mt-1 block text-xs text-body">
                        {CHANNELS[d.input.channel]} ·{' '}
                        {STATUSES[
                          d.campaignStatus === 'ended'
                            ? 'ended'
                            : d.adStatus || d.postStatus || d.campaignStatus || d.status
                        ] || d.status}
                      </span>
                      <span className="mt-1 block text-xs text-body">
                        Admin #{d.createdBy} · {new Date(d.updatedAt).toLocaleString('vi-VN')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {confirm && (
        <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-confirm-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded bg-white p-6 shadow-card dark:bg-boxdark"
          >
            <h2 id="marketing-confirm-title" className="mb-3 text-lg font-semibold">
              {confirm === 'publish'
                ? isPost
                  ? 'Xác nhận đăng bài'
                  : 'Xác nhận tạo quảng cáo'
                : confirm === 'activate'
                  ? 'Xác nhận bật quảng cáo'
                  : confirm === 'pause'
                    ? 'Tạm dừng quảng cáo?'
                    : 'Kết thúc chiến dịch?'}
            </h2>
            <p className="mb-3">
              {input.name} · {CHANNELS[input.channel]}
            </p>
            <p className="mb-4 whitespace-pre-wrap text-sm">
              {confirm === 'publish'
                ? content
                : confirm === 'activate'
                  ? `Ngân sách ${money(input.dailyBudgetVnd)}/ngày, tổng dự kiến ${money(total)}.`
                  : confirm === 'end'
                    ? 'Dừng quảng cáo, giải phóng ngân sách chưa dùng và hủy bài chưa đến giờ đăng. Bài đã đăng được giữ trên Facebook.'
                    : 'Quảng cáo sẽ ngừng phân phối.'}
            </p>
            {confirm === 'publish' && !isPost && (
              <p className="mb-4 text-sm">
                Tổng ngân sách {money(total)}. Quảng cáo được tạo tạm dừng; bạn bật chạy sau khi kiểm tra.
              </p>
            )}
            <p className="mb-4 text-sm font-medium">
              {mode === 'fake' ? 'Chế độ mô phỏng, không gửi lên nền tảng thật.' : 'Thao tác trên nền tảng thật.'}
            </p>
            <div className="flex justify-end gap-3">
              <button className={button} disabled={busy} onClick={() => setConfirm(undefined)}>
                Hủy
              </button>
              <button className={primary} disabled={busy} onClick={() => void confirmAction()}>
                {busy ? 'Đang xử lý…' : 'Xác nhận'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
