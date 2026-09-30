// The shop agent's business controls (docs/GROWTH_AGENT.md sections 4 and 6): keys, defaults and validation.
// Values are JSON read by the agent (`analytics.agent_settings`), so their fields are snake_case like the Agent API.
// Every key here is non-secret; the view exposes exactly these keys.

export const CAPABILITIES = [
  'promotion',
  'facebook_post',
  'ads_meta',
  'ads_google',
  'ads_tiktok',
  'inventory',
  'ops_tasks',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const AUTONOMY_MODES = ['off', 'shadow', 'ask', 'auto_low'] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

// `auto`: computed from the sales history (analytics.growth_targets).
export interface GrowthGoal {
  revenue_target_vnd: number | 'auto';
  margin_floor_pct: number;
  max_spend_ratio_pct: number;
}

export interface GrowthCaps {
  monthly_ad_cap_vnd: number | 'auto';
  per_campaign_vnd: number;
  per_day_vnd: number;
}

// A Google Trends keyword, mapped to one of our categories (slug) when it has one.
export interface TrendKeyword {
  keyword: string;
  category: string | null;
}

export interface AgentSettings {
  // The kill switch: false stops every non-protective agent write (enforced by the web from Phase 6).
  'growth.enabled': boolean;
  'growth.goal': GrowthGoal;
  'growth.caps': GrowthCaps;
  autonomy: Record<Capability, AutonomyMode>;
  // Growth copy stays in shadow until the owner has reviewed the brand guide (decision Q5).
  'brand.approved': boolean;
  'approvals.high.two_person': boolean;
  'market.trend_keywords': TrendKeyword[];
}
export type AgentSettingKey = keyof AgentSettings;

// Capabilities that already ran in v1 keep asking a person; the growth ones start in shadow (go-live plan).
export const AGENT_SETTING_DEFAULTS: AgentSettings = {
  'growth.enabled': true,
  'growth.goal': { revenue_target_vnd: 'auto', margin_floor_pct: 15, max_spend_ratio_pct: 8 },
  'growth.caps': { monthly_ad_cap_vnd: 'auto', per_campaign_vnd: 3_000_000, per_day_vnd: 500_000 },
  autonomy: {
    promotion: 'ask',
    facebook_post: 'shadow',
    ads_meta: 'shadow',
    ads_google: 'shadow',
    ads_tiktok: 'shadow',
    inventory: 'ask',
    ops_tasks: 'ask',
  },
  'brand.approved': false,
  'approvals.high.two_person': false,
  'market.trend_keywords': [],
};

export const AGENT_SETTING_KEYS = Object.keys(AGENT_SETTING_DEFAULTS) as AgentSettingKey[];

export const isAgentSettingKey = (key: string): key is AgentSettingKey =>
  (AGENT_SETTING_KEYS as string[]).includes(key);

const MAX_VND = 100_000_000_000; // 100 billion VND: far above any value a small shop sets
const MAX_TREND_KEYWORDS = 20;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const vnd = (value: unknown, label: string, errors: string[], { allowAuto = false } = {}): number | 'auto' => {
  if (allowAuto && value === 'auto') return 'auto';
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_VND) {
    errors.push(`${label} phải là số tiền nguyên (VND) từ 0 đến ${MAX_VND.toLocaleString('vi-VN')}.`);
    return 0;
  }
  return value;
};

const percent = (value: unknown, label: string, max: number, errors: string[]): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    errors.push(`${label} phải là số từ 0 đến ${max}.`);
    return 0;
  }
  return value;
};

const exactKeys = (value: Record<string, unknown>, keys: string[], errors: string[]) => {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !(key in value));
  if (unknown.length > 0) errors.push(`Trường không hợp lệ: ${unknown.join(', ')}.`);
  if (missing.length > 0) errors.push(`Thiếu trường: ${missing.join(', ')}.`);
};

// Checks a proposed value; returns the normalised value and the problems (Vietnamese, shown to the admin).
export const validateAgentSetting = <K extends AgentSettingKey>(
  key: K,
  value: unknown,
): { value: AgentSettings[K]; errors: string[] } => {
  const errors: string[] = [];
  const done = (normalised: unknown) => ({ value: normalised as AgentSettings[K], errors });

  switch (key) {
    case 'growth.enabled':
    case 'brand.approved':
    case 'approvals.high.two_person':
      if (typeof value !== 'boolean') errors.push('Giá trị phải là bật hoặc tắt.');
      return done(value);

    case 'growth.goal': {
      if (!isPlainObject(value)) return done((errors.push('Mục tiêu không hợp lệ.'), value));
      exactKeys(value, ['revenue_target_vnd', 'margin_floor_pct', 'max_spend_ratio_pct'], errors);
      return done({
        revenue_target_vnd: vnd(value.revenue_target_vnd, 'Doanh thu mục tiêu', errors, { allowAuto: true }),
        margin_floor_pct: percent(value.margin_floor_pct, 'Biên lợi nhuận tối thiểu (%)', 90, errors),
        max_spend_ratio_pct: percent(value.max_spend_ratio_pct, 'Tỷ lệ chi quảng cáo tối đa (%)', 50, errors),
      });
    }

    case 'growth.caps': {
      if (!isPlainObject(value)) return done((errors.push('Hạn mức không hợp lệ.'), value));
      exactKeys(value, ['monthly_ad_cap_vnd', 'per_campaign_vnd', 'per_day_vnd'], errors);
      const caps = {
        monthly_ad_cap_vnd: vnd(value.monthly_ad_cap_vnd, 'Ngân sách quảng cáo tháng', errors, { allowAuto: true }),
        per_campaign_vnd: vnd(value.per_campaign_vnd, 'Ngân sách mỗi chiến dịch', errors) as number,
        per_day_vnd: vnd(value.per_day_vnd, 'Ngân sách mỗi ngày', errors) as number,
      };
      if (caps.per_day_vnd > caps.per_campaign_vnd) {
        errors.push('Ngân sách mỗi ngày không được lớn hơn ngân sách mỗi chiến dịch.');
      }
      if (caps.monthly_ad_cap_vnd !== 'auto' && caps.per_campaign_vnd > caps.monthly_ad_cap_vnd) {
        errors.push('Ngân sách mỗi chiến dịch không được lớn hơn ngân sách quảng cáo tháng.');
      }
      return done(caps);
    }

    case 'autonomy': {
      if (!isPlainObject(value)) return done((errors.push('Chế độ tự chủ không hợp lệ.'), value));
      exactKeys(value, [...CAPABILITIES], errors);
      for (const capability of CAPABILITIES) {
        if (!(AUTONOMY_MODES as readonly unknown[]).includes(value[capability])) {
          errors.push(`Chế độ của "${capability}" phải là một trong: ${AUTONOMY_MODES.join(', ')}.`);
        }
      }
      return done(value);
    }

    case 'market.trend_keywords': {
      if (!Array.isArray(value)) return done((errors.push('Danh sách từ khoá không hợp lệ.'), value));
      if (value.length > MAX_TREND_KEYWORDS) errors.push(`Tối đa ${MAX_TREND_KEYWORDS} từ khoá.`);
      const keywords = value.map((item) => {
        const keyword = isPlainObject(item) && typeof item.keyword === 'string' ? item.keyword.trim() : '';
        const category = isPlainObject(item) && typeof item.category === 'string' ? item.category.trim() : '';
        if (keyword.length < 2 || keyword.length > 60) errors.push(`Từ khoá "${keyword}" phải dài 2-60 ký tự.`);
        return { keyword, category: category || null };
      });
      const lower = keywords.map((item) => item.keyword.toLowerCase());
      if (new Set(lower).size !== lower.length) errors.push('Từ khoá bị trùng.');
      return done(keywords);
    }

    default:
      errors.push('Khoá cài đặt không tồn tại.');
      return done(value);
  }
};
