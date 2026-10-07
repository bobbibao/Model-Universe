'use client';

import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import { inputClassName } from '@/components/FormElements/TextField';
import AgentSettingsApi from '@/core/client/api/AgentSettings';
import { formatVND } from '@/shared/server/utils/utils';
import type {
  AgentSettingKey,
  AgentSettingsPayload,
  AgentSettingValues,
  AutonomyMode,
  CapabilityKey,
  GrowthCaps,
  GrowthGoal,
  SettingEntry,
} from '@/shared/types/agent-settings';
import { formatDateTime } from '../components/agentLabels';

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  promotion: 'Khuyến mãi (giảm giá, mã giảm giá)',
  facebookPost: 'Bài đăng Facebook',
  adsMeta: 'Quảng cáo Meta (Facebook, Instagram)',
  adsGoogle: 'Quảng cáo Google',
  adsTiktok: 'Quảng cáo TikTok',
  inventory: 'Tồn kho và kênh bán',
  opsTasks: 'Công việc và quy trình (SOP)',
};

const MODE_LABELS: Record<AutonomyMode, string> = {
  off: 'Tắt',
  shadow: 'Quan sát (chỉ ghi nhận, không thực hiện)',
  ask: 'Hỏi người duyệt',
  auto_low: 'Tự động với thao tác rủi ro thấp',
};

const SETTING_LABELS: Record<AgentSettingKey, string> = {
  'growth.enabled': 'Công tắc tăng trưởng',
  'growth.goal': 'Mục tiêu tháng',
  'growth.caps': 'Ngân sách quảng cáo',
  autonomy: 'Mức tự chủ',
  'brand.approved': 'Duyệt thương hiệu',
  'approvals.high.two_person': 'Duyệt hai người',
  'market.trend_keywords': 'Từ khoá xu hướng',
};

const TARGET_SOURCE: Record<string, string> = {
  owner: 'do chủ cửa hàng đặt',
  auto_last_year: 'tự động: 110% cùng tháng năm trước',
  auto_trailing_3m: 'tự động: 110% trung bình 3 tháng gần nhất',
  auto: 'tự động: 5% doanh thu tháng, tối đa 10.000.000 ₫',
  none: 'chưa có lịch sử bán hàng: hãy tự đặt',
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
    <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">{title}</h3>
    {children}
  </section>
);

const SaveButton = ({ busy, onClick }: { busy: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    disabled={busy}
    className="mt-4 rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
  >
    {busy ? 'Đang lưu...' : 'Lưu'}
  </button>
);

const digits = (value: string) => value.replace(/\D/g, '');
const decimal = (value: string) => value.replace(/[^\d.]/g, '');

// An amount that is either `auto` or the owner's number, with the automatic value shown next to it.
const AutoAmount = ({
  label,
  value,
  onChange,
  computed,
}: {
  label: string;
  value: number | 'auto';
  onChange: (value: number | 'auto') => void;
  computed: string;
}) => (
  <div className="flex flex-col gap-2 text-sm">
    <span className="font-medium text-black dark:text-white">{label}</span>
    <label className="flex items-center gap-2">
      <input type="radio" checked={value === 'auto'} onChange={() => onChange('auto')} />
      Tự động <span className="text-body">({computed})</span>
    </label>
    <label className="flex items-center gap-2">
      <input type="radio" checked={value !== 'auto'} onChange={() => onChange(0)} />
      Tự đặt:
      <input
        className={`${inputClassName} !w-48 !py-1.5`}
        inputMode="numeric"
        disabled={value === 'auto'}
        aria-label={`${label} (VND)`}
        value={value === 'auto' ? '' : String(value)}
        onChange={(event) => onChange(Number(digits(event.target.value)) || 0)}
      />
      ₫
    </label>
  </div>
);

// The agent's business controls: kill switch, growth goal, ad budget caps, autonomy per capability.
const Settings = () => {
  const [data, setData] = useState<AgentSettingsPayload>();
  const [draft, setDraft] = useState<Partial<AgentSettingValues>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<AgentSettingKey | null>(null);

  const load = useCallback(async () => {
    const result = await AgentSettingsApi.getSettings();
    if (!result) return;
    setData(result);
    setDraft(Object.fromEntries(result.settings.map((entry) => [entry.key, entry.value])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <>
        <Breadcrumb pageName="Cài đặt Agent" />
        <p className="text-body">Đang tải...</p>
      </>
    );
  }

  const entry = <K extends AgentSettingKey>(key: K) =>
    data.settings.find((item) => item.key === key) as SettingEntry<K>;
  const value = <K extends AgentSettingKey>(key: K) => (draft[key] ?? entry(key).value) as AgentSettingValues[K];
  const set = <K extends AgentSettingKey>(key: K, next: AgentSettingValues[K]) => setDraft({ ...draft, [key]: next });

  const save = async <K extends AgentSettingKey>(key: K, next: AgentSettingValues[K] = value(key)) => {
    setBusy(key);
    const saved = await AgentSettingsApi.updateSetting(key, next, entry(key).version, reason.trim() || undefined);
    setBusy(null);
    if (saved) {
      setReason('');
      await load();
    }
  };

  const goal = value('growth.goal') as GrowthGoal;
  const caps = value('growth.caps') as GrowthCaps;
  const autonomy = value('autonomy');
  const targets = data.targets;
  const computedTarget = targets?.revenueTargetVnd != null ? formatVND(targets.revenueTargetVnd) : 'chưa đủ lịch sử';
  const computedCap = targets ? formatVND(targets.monthlyAdCapVnd) : '—';

  return (
    <>
      <Breadcrumb pageName="Cài đặt Agent" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Công tắc">
          <div className="flex flex-col gap-4 text-sm">
            {(
              [
                ['growth.enabled', 'Cho phép Agent tăng trưởng hoạt động (tắt: không mở đề xuất tăng trưởng mới)'],
                [
                  'brand.approved',
                  'Đã duyệt tài liệu thương hiệu (brand_guide.md); trước đó nội dung chỉ ở chế độ quan sát',
                ],
                ['approvals.high.two_person', 'Thao tác rủi ro cao cần hai quản trị viên khác nhau duyệt'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={value(key) as boolean}
                  disabled={busy !== null}
                  onChange={(event) => save(key, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Mục tiêu tháng">
          <div className="flex flex-col gap-4">
            <AutoAmount
              label="Doanh thu mục tiêu"
              value={goal.revenueTargetVnd}
              onChange={(next) => set('growth.goal', { ...goal, revenueTargetVnd: next })}
              computed={`${computedTarget}, ${TARGET_SOURCE[targets?.revenueTargetSource ?? 'none']}`}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-body">Biên lợi nhuận gộp tối thiểu (%)</span>
                <input
                  className={inputClassName}
                  inputMode="decimal"
                  value={String(goal.marginFloorPct)}
                  onChange={(event) =>
                    set('growth.goal', { ...goal, marginFloorPct: Number(decimal(event.target.value)) || 0 })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-body">Chi phí marketing tối đa (% doanh thu)</span>
                <input
                  className={inputClassName}
                  inputMode="decimal"
                  value={String(goal.maxSpendRatioPct)}
                  onChange={(event) =>
                    set('growth.goal', { ...goal, maxSpendRatioPct: Number(decimal(event.target.value)) || 0 })
                  }
                />
              </label>
            </div>
          </div>
          <SaveButton busy={busy === 'growth.goal'} onClick={() => save('growth.goal')} />
        </Card>

        <Card title="Ngân sách quảng cáo">
          <div className="flex flex-col gap-4">
            <AutoAmount
              label="Ngân sách quảng cáo mỗi tháng"
              value={caps.monthlyAdCapVnd}
              onChange={(next) => set('growth.caps', { ...caps, monthlyAdCapVnd: next })}
              computed={`${computedCap}, ${TARGET_SOURCE[targets?.monthlyAdCapSource ?? 'none']}`}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-body">Tối đa mỗi chiến dịch (₫)</span>
                <input
                  className={inputClassName}
                  inputMode="numeric"
                  value={String(caps.perCampaignVnd)}
                  onChange={(event) =>
                    set('growth.caps', { ...caps, perCampaignVnd: Number(digits(event.target.value)) || 0 })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-body">Tối đa mỗi ngày (₫)</span>
                <input
                  className={inputClassName}
                  inputMode="numeric"
                  value={String(caps.perDayVnd)}
                  onChange={(event) =>
                    set('growth.caps', { ...caps, perDayVnd: Number(digits(event.target.value)) || 0 })
                  }
                />
              </label>
            </div>
          </div>
          <SaveButton busy={busy === 'growth.caps'} onClick={() => save('growth.caps')} />
        </Card>

        <Card title="Mức tự chủ theo năng lực">
          <div className="flex flex-col gap-3 text-sm">
            {(Object.keys(CAPABILITY_LABELS) as CapabilityKey[]).map((capability) => (
              <label key={capability} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                <span>{CAPABILITY_LABELS[capability]}</span>
                <select
                  className={`${inputClassName} !py-2`}
                  value={autonomy[capability]}
                  onChange={(event) =>
                    set('autonomy', { ...autonomy, [capability]: event.target.value as AutonomyMode })
                  }
                >
                  {(Object.keys(MODE_LABELS) as AutonomyMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              <span className="mb-1 block text-body">Lý do thay đổi (ghi vào nhật ký)</span>
              <input className={inputClassName} value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <SaveButton busy={busy === 'autonomy'} onClick={() => save('autonomy')} />
        </Card>

        <Card title="Lịch sử thay đổi">
          {data.audit.length === 0 ? (
            <p className="text-sm text-body">Chưa có thay đổi nào.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.audit.map((item) => (
                <li key={item.id}>
                  <span className="text-body">{formatDateTime(item.createdAt)}</span> · {SETTING_LABELS[item.key]}{' '}
                  (phiên bản {item.version})
                  {item.reason && <span className="block text-body">&quot;{item.reason}&quot;</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
};

export default Settings;
