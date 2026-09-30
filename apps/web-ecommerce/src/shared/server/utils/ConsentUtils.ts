// Cookie consent (Decree 13/2023/ND-CP; docs/GROWTH_AGENT.md section 5): marketing tags load only after the visitor
// accepted marketing cookies, and only for the platforms whose public id is configured. Pure functions, used by the
// browser and the server alike.

export const CONSENT_COOKIE = 'consent';
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const CONSENT_VERSION = 1;

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
}

export const parseConsentCookie = (raw: unknown): ConsentChoice | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.v !== CONSENT_VERSION || typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean') {
      return null;
    }
    return { analytics: value.analytics, marketing: value.marketing };
  } catch {
    return null;
  }
};

export const consentCookieValue = (choice: ConsentChoice): string =>
  JSON.stringify({ v: CONSENT_VERSION, analytics: choice.analytics, marketing: choice.marketing });

// Public ids of the tracking tags (NEXT_PUBLIC_*, inlined at build time).
export interface TrackingIds {
  metaPixelId?: string;
  googleTagId?: string;
  googleAdsConversionLabel?: string;
  tiktokPixelId?: string;
}

export type TagPlatform = 'meta' | 'google' | 'tiktok';

export interface TagScript {
  platform: TagPlatform;
  id: string;
}

const PIXEL_ID = /^[A-Za-z0-9_-]{4,40}$/;

// Which tags may load: none without marketing consent; otherwise one per configured (and well-formed) id.
export const allowedTags = (consent: ConsentChoice | null, ids: TrackingIds): TagScript[] => {
  if (!consent?.marketing) return [];
  const tags: TagScript[] = [];
  if (ids.metaPixelId && PIXEL_ID.test(ids.metaPixelId)) tags.push({ platform: 'meta', id: ids.metaPixelId });
  if (ids.googleTagId && PIXEL_ID.test(ids.googleTagId)) tags.push({ platform: 'google', id: ids.googleTagId });
  if (ids.tiktokPixelId && PIXEL_ID.test(ids.tiktokPixelId)) tags.push({ platform: 'tiktok', id: ids.tiktokPixelId });
  return tags;
};
