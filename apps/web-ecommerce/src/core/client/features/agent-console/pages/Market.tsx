'use client';

import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import { inputClassName } from '@/components/FormElements/TextField';
import MarketApi, { CampaignInput, PriceInput } from '@/core/client/api/Market';
import AgentSettingsApi from '@/core/client/api/AgentSettings';
import { ADMIN_AGENT_API } from '@/core/client/api/endpoint';
import { formatVND } from '@/shared/server/utils/utils';
import type {
  Competitor,
  CompetitorCampaign,
  CompetitorPrice,
  MarketEvent,
  MarketSource,
  SettingEntry,
  TrendKeyword,
} from '@/shared/types/agent-settings';
import { formatDateTime } from '../components/agentLabels';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Nhập tay',
  csv: 'Tệp CSV',
  scraper: 'Website đối thủ',
  fixture: 'Dữ liệu mẫu',
};

const SOURCE_STATUS: Record<MarketSource['status'], { label: string; className: string }> = {
  ok: { label: 'Bình thường', className: 'text-success' },
  degraded: { label: 'Chập chờn', className: 'text-warning' },
  blocked: { label: 'Bị chặn, đã dừng', className: 'text-danger' },
  off: { label: 'Tắt', className: 'text-body' },
};

const COLLECTOR_NAMES: Record<string, string> = {
  trends: 'Google Trends',
  competitor_sites: 'Website đối thủ',
  fixture: 'Dữ liệu mẫu',
};

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');

const Field = ({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <label className={`text-sm ${className}`}>
    <span className="mb-1 block text-body">{label}</span>
    {children}
  </label>
);

const emptyCompetitor = { name: '', website: '', notes: '', isActive: true };
const emptyPrice = (): PriceInput => ({
  competitor: '',
  sku: '',
  url: '',
  title: '',
  priceVnd: '',
  observedAt: new Date().toISOString().slice(0, 10),
  watch: false,
});
const emptyCampaign = (): CampaignInput => ({
  competitorId: 0,
  title: '',
  category: '',
  discountPct: '',
  startsAt: '',
  endsAt: '',
  url: '',
});

const PrimaryButton = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
  >
    {children}
  </button>
);

// Market data the growth agent reads: competitors, their prices and campaigns, the retail calendar, the trend
// keywords, and the health of the agent's collectors.
const Market = () => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [prices, setPrices] = useState<CompetitorPrice[]>([]);
  const [campaigns, setCampaigns] = useState<CompetitorCampaign[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [sources, setSources] = useState<MarketSource[]>([]);
  const [keywords, setKeywords] = useState<SettingEntry<'market.trend_keywords'>>();
  const [keywordDraft, setKeywordDraft] = useState<TrendKeyword[]>([]);
  const [competitorForm, setCompetitorForm] = useState({ ...emptyCompetitor });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [priceForm, setPriceForm] = useState<PriceInput>(emptyPrice());
  const [campaignForm, setCampaignForm] = useState<CampaignInput>(emptyCampaign());
  const [removing, setRemoving] = useState<{ kind: 'competitor' | 'price' | 'campaign'; id: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [competitorList, priceList, campaignList, eventList, sourceList, settings] = await Promise.all([
      MarketApi.getCompetitors(),
      MarketApi.getPrices(),
      MarketApi.getCampaigns(),
      MarketApi.getEvents(),
      MarketApi.getSources(),
      AgentSettingsApi.getSettings(),
    ]);
    setCompetitors(competitorList || []);
    setPrices(priceList || []);
    setCampaigns(campaignList || []);
    setEvents(eventList || []);
    setSources(sourceList || []);
    const entry = settings?.settings.find((item) => item.key === 'market.trend_keywords') as
      SettingEntry<'market.trend_keywords'> | undefined;
    setKeywords(entry);
    setKeywordDraft(entry?.value ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (call: () => Promise<unknown>, onDone?: () => void) => {
    setBusy(true);
    const result = await call();
    setBusy(false);
    if (result) {
      onDone?.();
      await load();
    }
  };

  const saveCompetitor = () =>
    run(
      () =>
        editingId ? MarketApi.updateCompetitor(editingId, competitorForm) : MarketApi.createCompetitor(competitorForm),
      () => {
        setCompetitorForm({ ...emptyCompetitor });
        setEditingId(null);
      },
    );

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await run(async () => MarketApi.importPrices(await file.text()));
  };

  const saveKeywords = () =>
    keywords &&
    run(() =>
      AgentSettingsApi.updateSetting(
        'market.trend_keywords',
        keywordDraft.filter((item) => item.keyword.trim()),
        keywords.version,
      ),
    );

  const confirmRemove = async () => {
    if (!removing) return;
    const { kind, id } = removing;
    await run(() =>
      kind === 'competitor'
        ? MarketApi.removeCompetitor(id)
        : kind === 'price'
          ? MarketApi.removePrice(id)
          : MarketApi.removeCampaign(id),
    );
    setRemoving(null);
  };

  const competitorColumns: DataTableColumn<Competitor>[] = [
    { key: 'name', header: 'Đối thủ', render: (row) => <span className="font-semibold">{row.name}</span> },
    {
      key: 'website',
      header: 'Website',
      render: (row) =>
        row.website ? (
          <a href={row.website} target="_blank" rel="noreferrer" className="text-brand-hover hover:underline">
            {row.website}
          </a>
        ) : (
          '—'
        ),
    },
    { key: 'isActive', header: 'Theo dõi', render: (row) => (row.isActive ? 'Có' : 'Tạm dừng') },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-3 text-sm">
          <button
            className="text-brand-hover hover:underline"
            onClick={() => {
              setEditingId(row.id);
              setCompetitorForm({
                name: row.name,
                website: row.website || '',
                notes: row.notes || '',
                isActive: row.isActive,
              });
            }}
          >
            Sửa
          </button>
          <button
            className="text-danger hover:underline"
            onClick={() => setRemoving({ kind: 'competitor', id: row.id })}
          >
            Xoá
          </button>
        </div>
      ),
    },
  ];

  const priceColumns: DataTableColumn<CompetitorPrice>[] = [
    { key: 'observedAt', header: 'Ngày', render: (row) => formatDate(row.observedAt) },
    { key: 'competitor', header: 'Đối thủ', render: (row) => row.competitor?.name },
    {
      key: 'product',
      header: 'Sản phẩm của mình',
      render: (row) =>
        row.ourProduct ? (
          <span>
            {row.ourProduct.sku} · {row.ourProduct.name}
          </span>
        ) : (
          <span className="text-body">{row.title || row.url || '—'}</span>
        ),
    },
    { key: 'priceVnd', header: 'Giá đối thủ', render: (row) => formatVND(row.priceVnd) },
    {
      key: 'gap',
      header: 'So với giá mình',
      render: (row) => {
        if (!row.ourProduct) return '—';
        const gap = ((row.priceVnd - row.ourProduct.price) / row.ourProduct.price) * 100;
        return (
          <span className={gap < 0 ? 'text-danger' : 'text-success'}>
            {gap > 0 ? '+' : ''}
            {gap.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
          </span>
        );
      },
    },
    {
      key: 'source',
      header: 'Nguồn',
      render: (row) => `${SOURCE_LABELS[row.source] || row.source}${row.watch ? ' · theo dõi tự động' : ''}`,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button
          className="text-sm text-danger hover:underline"
          onClick={() => setRemoving({ kind: 'price', id: row.id })}
        >
          Xoá
        </button>
      ),
    },
  ];

  const campaignColumns: DataTableColumn<CompetitorCampaign>[] = [
    { key: 'competitor', header: 'Đối thủ', render: (row) => row.competitor?.name },
    { key: 'title', header: 'Chương trình', render: (row) => row.title },
    {
      key: 'discountPct',
      header: 'Mức giảm',
      render: (row) => (row.discountPct != null ? `${row.discountPct}%` : '—'),
    },
    { key: 'dates', header: 'Thời gian', render: (row) => `${formatDate(row.startsAt)} - ${formatDate(row.endsAt)}` },
    { key: 'category', header: 'Danh mục', render: (row) => row.category || 'Tất cả' },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button
          className="text-sm text-danger hover:underline"
          onClick={() => setRemoving({ kind: 'campaign', id: row.id })}
        >
          Xoá
        </button>
      ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Dữ liệu thị trường" />
      <div className="flex flex-col gap-6">
        <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">
            {editingId ? 'Sửa đối thủ' : 'Thêm đối thủ'}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Tên">
              <input
                className={inputClassName}
                value={competitorForm.name}
                onChange={(event) => setCompetitorForm({ ...competitorForm, name: event.target.value })}
              />
            </Field>
            <Field label="Website riêng (không phải sàn TMĐT)">
              <input
                className={inputClassName}
                value={competitorForm.website}
                onChange={(event) => setCompetitorForm({ ...competitorForm, website: event.target.value })}
              />
            </Field>
            <Field label="Ghi chú">
              <input
                className={inputClassName}
                value={competitorForm.notes}
                onChange={(event) => setCompetitorForm({ ...competitorForm, notes: event.target.value })}
              />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={competitorForm.isActive}
                onChange={(event) => setCompetitorForm({ ...competitorForm, isActive: event.target.checked })}
              />
              Đang theo dõi
            </label>
            <PrimaryButton disabled={busy} onClick={saveCompetitor}>
              {editingId ? 'Lưu' : 'Thêm đối thủ'}
            </PrimaryButton>
            {editingId && (
              <button
                className="text-sm hover:underline"
                onClick={() => {
                  setEditingId(null);
                  setCompetitorForm({ ...emptyCompetitor });
                }}
              >
                Huỷ
              </button>
            )}
          </div>
        </section>
        <DataTable
          title="Đối thủ"
          columns={competitorColumns}
          data={competitors}
          rowKey={(row) => row.id}
          emptyText="Chưa có đối thủ: thêm 3-5 đối thủ trực tiếp để Agent theo dõi giá"
        />

        <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">Thêm giá đối thủ</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Đối thủ">
              <select
                className={`${inputClassName} !py-2.5`}
                value={priceForm.competitor}
                onChange={(event) => setPriceForm({ ...priceForm, competitor: event.target.value })}
              >
                <option value="">Chọn đối thủ</option>
                {competitors.map((competitor) => (
                  <option key={competitor.id} value={competitor.name}>
                    {competitor.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mã sản phẩm của mình (SKU)">
              <input
                className={inputClassName}
                value={priceForm.sku}
                onChange={(event) => setPriceForm({ ...priceForm, sku: event.target.value })}
              />
            </Field>
            <Field label="Giá của đối thủ (₫)">
              <input
                className={inputClassName}
                inputMode="numeric"
                value={priceForm.priceVnd}
                onChange={(event) => setPriceForm({ ...priceForm, priceVnd: event.target.value.replace(/\D/g, '') })}
              />
            </Field>
            <Field label="Đường dẫn sản phẩm của đối thủ">
              <input
                className={inputClassName}
                value={priceForm.url}
                onChange={(event) => setPriceForm({ ...priceForm, url: event.target.value })}
              />
            </Field>
            <Field label="Tên sản phẩm của đối thủ">
              <input
                className={inputClassName}
                value={priceForm.title}
                onChange={(event) => setPriceForm({ ...priceForm, title: event.target.value })}
              />
            </Field>
            <Field label="Ngày quan sát">
              <input
                type="date"
                className={inputClassName}
                value={priceForm.observedAt}
                onChange={(event) => setPriceForm({ ...priceForm, observedAt: event.target.value })}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={priceForm.watch}
                onChange={(event) => setPriceForm({ ...priceForm, watch: event.target.checked })}
              />
              Theo dõi tự động trang này (chỉ website riêng của đối thủ)
            </label>
            <PrimaryButton
              disabled={busy}
              onClick={() =>
                run(
                  () => MarketApi.addPrice(priceForm),
                  () => setPriceForm(emptyPrice()),
                )
              }
            >
              Thêm giá
            </PrimaryButton>
          </div>
          <div className="mt-5 border-t border-stroke pt-4 text-sm dark:border-strokedark">
            <p className="mb-2">
              Nhập hàng loạt (giá trên sàn TMĐT nhập tay theo tuần): tệp CSV theo{' '}
              <a href={ADMIN_AGENT_API.PRICE_TEMPLATE} className="text-brand-hover hover:underline">
                mẫu
              </a>
              . Tệp có dòng lỗi sẽ không được nhập, kèm danh sách lỗi từng dòng.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={importCsv}
              aria-label="Tệp CSV giá đối thủ"
            />
          </div>
        </section>
        <DataTable
          title="Giá đối thủ gần đây"
          columns={priceColumns}
          data={prices}
          rowKey={(row) => row.id}
          emptyText="Chưa có giá đối thủ"
        />

        <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">Thêm chương trình của đối thủ</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Đối thủ">
              <select
                className={`${inputClassName} !py-2.5`}
                value={campaignForm.competitorId}
                onChange={(event) => setCampaignForm({ ...campaignForm, competitorId: Number(event.target.value) })}
              >
                <option value={0}>Chọn đối thủ</option>
                {competitors.map((competitor) => (
                  <option key={competitor.id} value={competitor.id}>
                    {competitor.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nội dung chương trình" className="md:col-span-2">
              <input
                className={inputClassName}
                value={campaignForm.title}
                onChange={(event) => setCampaignForm({ ...campaignForm, title: event.target.value })}
              />
            </Field>
            <Field label="Mức giảm (%)">
              <input
                className={inputClassName}
                inputMode="decimal"
                value={campaignForm.discountPct}
                onChange={(event) =>
                  setCampaignForm({ ...campaignForm, discountPct: event.target.value.replace(/[^\d.]/g, '') })
                }
              />
            </Field>
            <Field label="Từ ngày">
              <input
                type="date"
                className={inputClassName}
                value={campaignForm.startsAt}
                onChange={(event) => setCampaignForm({ ...campaignForm, startsAt: event.target.value })}
              />
            </Field>
            <Field label="Đến ngày">
              <input
                type="date"
                className={inputClassName}
                value={campaignForm.endsAt}
                onChange={(event) => setCampaignForm({ ...campaignForm, endsAt: event.target.value })}
              />
            </Field>
            <Field label="Danh mục của mình (slug, để trống: tất cả)">
              <input
                className={inputClassName}
                value={campaignForm.category}
                onChange={(event) => setCampaignForm({ ...campaignForm, category: event.target.value })}
              />
            </Field>
            <Field label="Đường dẫn" className="md:col-span-2">
              <input
                className={inputClassName}
                value={campaignForm.url}
                onChange={(event) => setCampaignForm({ ...campaignForm, url: event.target.value })}
              />
            </Field>
          </div>
          <div className="mt-3">
            <PrimaryButton
              disabled={busy}
              onClick={() =>
                run(
                  () => MarketApi.addCampaign(campaignForm),
                  () => setCampaignForm(emptyCampaign()),
                )
              }
            >
              Thêm chương trình
            </PrimaryButton>
          </div>
        </section>
        <DataTable
          title="Chương trình của đối thủ"
          columns={campaignColumns}
          data={campaigns}
          rowKey={(row) => row.id}
          emptyText="Chưa có chương trình nào"
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">Từ khoá xu hướng (Google Trends)</h3>
            <p className="mb-3 text-sm text-body">Tối đa 20 từ khoá, mỗi từ khoá gắn với một danh mục (slug) nếu có.</p>
            <div className="flex flex-col gap-2">
              {keywordDraft.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className={`${inputClassName} !py-2`}
                    aria-label="Từ khoá"
                    value={item.keyword}
                    onChange={(event) =>
                      setKeywordDraft(
                        keywordDraft.map((row, i) => (i === index ? { ...row, keyword: event.target.value } : row)),
                      )
                    }
                  />
                  <input
                    className={`${inputClassName} !w-40 !py-2`}
                    aria-label="Danh mục"
                    placeholder="danh mục"
                    value={item.category ?? ''}
                    onChange={(event) =>
                      setKeywordDraft(
                        keywordDraft.map((row, i) =>
                          i === index ? { ...row, category: event.target.value || null } : row,
                        ),
                      )
                    }
                  />
                  <button
                    className="text-sm text-danger hover:underline"
                    onClick={() => setKeywordDraft(keywordDraft.filter((_, i) => i !== index))}
                  >
                    Xoá
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              <button
                className="rounded-md border border-stroke px-4 py-2 text-sm dark:border-strokedark"
                disabled={keywordDraft.length >= 20}
                onClick={() => setKeywordDraft([...keywordDraft, { keyword: '', category: null }])}
              >
                Thêm từ khoá
              </button>
              <PrimaryButton disabled={busy || !keywords} onClick={saveKeywords}>
                Lưu từ khoá
              </PrimaryButton>
            </div>
          </section>

          <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">Nguồn dữ liệu tự động</h3>
            {sources.length === 0 ? (
              <p className="text-sm text-body">Agent chưa chạy lượt thu thập nào.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {sources.map((source) => (
                  <li key={source.name}>
                    <span className="font-semibold">{COLLECTOR_NAMES[source.name] || source.name}</span>:{' '}
                    <span className={SOURCE_STATUS[source.status].className}>{SOURCE_STATUS[source.status].label}</span>
                    <span className="block text-body">
                      Lần chạy gần nhất {formatDateTime(source.lastRunAt)} · thành công gần nhất{' '}
                      {formatDateTime(source.lastSuccessAt)}
                    </span>
                    {source.detail && <span className="block text-body">{source.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DataTable
          title="Lịch sự kiện bán lẻ sắp tới"
          columns={[
            { key: 'name', header: 'Sự kiện', render: (row: MarketEvent) => row.name },
            {
              key: 'dates',
              header: 'Thời gian',
              render: (row: MarketEvent) => `${formatDate(row.startsOn)} - ${formatDate(row.endsOn)}`,
            },
            { key: 'leadDays', header: 'Chuẩn bị trước', render: (row: MarketEvent) => `${row.leadDays} ngày` },
            {
              key: 'categories',
              header: 'Danh mục',
              render: (row: MarketEvent) => (row.categories.length ? row.categories.join(', ') : 'Tất cả'),
            },
          ]}
          data={events}
          rowKey={(row) => row.id}
          emptyText="Chưa có sự kiện"
        />
      </div>
      <ConfirmModal
        open={removing !== null}
        title="Xác nhận xoá"
        message={
          removing?.kind === 'competitor'
            ? 'Xoá đối thủ này cùng mọi giá và chương trình đã ghi nhận?'
            : 'Xoá dòng dữ liệu này?'
        }
        confirmLabel="Xoá"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </>
  );
};

export default Market;
