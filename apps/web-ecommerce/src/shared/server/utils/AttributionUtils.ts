// First-party attribution (docs/GROWTH_AGENT.md section 6): the storefront keeps the last non-direct click in a
// 30-day cookie (AttributionCapture) and the order stores it (OrderService.placeOrder). Pure functions, used by the
// browser and the server alike.

export const ATTRIBUTION_COOKIE = 'attribution';
export const ATTRIBUTION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export const CLICK_ID_PARAMS = ['fbclid', 'gclid', 'ttclid'] as const;
export type ClickIdType = (typeof CLICK_ID_PARAMS)[number];

export interface Attribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  clickId: string | null;
  clickIdType: ClickIdType | null;
  landingPath: string | null;
}

const MAX_VALUE_LENGTH = 100;
const MAX_CLICK_ID_LENGTH = 255;
const MAX_PATH_LENGTH = 200;

const clean = (value: unknown, max = MAX_VALUE_LENGTH): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const cleanPath = (value: unknown): string | null => {
  const path = clean(value, MAX_PATH_LENGTH);
  return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
};

// The attribution a landing URL carries, or null for a direct visit (no UTM tag, no click id): a direct visit keeps
// the previous click (last non-direct click wins).
export const attributionFromUrl = (search: URLSearchParams, pathname: string): Attribution | null => {
  const clickIdType = CLICK_ID_PARAMS.find((name) => clean(search.get(name))) ?? null;
  const attribution: Attribution = {
    utmSource: clean(search.get('utm_source')),
    utmMedium: clean(search.get('utm_medium')),
    utmCampaign: clean(search.get('utm_campaign')),
    utmContent: clean(search.get('utm_content')),
    utmTerm: clean(search.get('utm_term')),
    clickId: clickIdType ? clean(search.get(clickIdType), MAX_CLICK_ID_LENGTH) : null,
    clickIdType,
    landingPath: cleanPath(pathname),
  };
  const hasSource = UTM_PARAMS.some((name) => clean(search.get(name))) || attribution.clickId !== null;
  return hasSource ? attribution : null;
};

// The cookie's value, validated field by field (it comes from the browser); null when absent or unusable.
export const parseAttributionCookie = (raw: unknown): Attribution | null => {
  if (typeof raw !== 'string' || !raw) return null;
  let value: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    value = parsed;
  } catch {
    return null;
  }
  const clickIdType = (CLICK_ID_PARAMS as readonly unknown[]).includes(value.clickIdType)
    ? (value.clickIdType as ClickIdType)
    : null;
  const clickId = clickIdType ? clean(value.clickId, MAX_CLICK_ID_LENGTH) : null;
  const attribution: Attribution = {
    utmSource: clean(value.utmSource),
    utmMedium: clean(value.utmMedium),
    utmCampaign: clean(value.utmCampaign),
    utmContent: clean(value.utmContent),
    utmTerm: clean(value.utmTerm),
    clickId,
    clickIdType: clickId ? clickIdType : null,
    landingPath: cleanPath(value.landingPath),
  };
  return attribution.utmSource || attribution.utmCampaign || attribution.clickId ? attribution : null;
};
