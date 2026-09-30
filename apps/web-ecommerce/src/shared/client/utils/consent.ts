'use client';

import { useEffect, useState } from 'react';
import Api from '@/core/client/api/Api';
import { CONSENT_API } from '@/core/client/api/endpoint';
import { readCookie, writeCookie } from './cookies';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  ConsentChoice,
  TrackingIds,
  consentCookieValue,
  parseConsentCookie,
} from '@/shared/server/utils/ConsentUtils';

// Public ids of the marketing tags, inlined at build time; unset ids load nothing.
export const TRACKING_IDS: TrackingIds = {
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  googleTagId: process.env.NEXT_PUBLIC_GOOGLE_TAG_ID,
  googleAdsConversionLabel: process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL,
  tiktokPixelId: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
};

// Without any configured tag the shop sets no optional cookie, so there is nothing to ask.
export const hasTrackingTags = Boolean(
  TRACKING_IDS.metaPixelId || TRACKING_IDS.googleTagId || TRACKING_IDS.tiktokPixelId,
);

const CHANGE_EVENT = 'consent-change';
const OPEN_EVENT = 'consent-open';

export const readConsent = (): ConsentChoice | null => parseConsentCookie(readCookie(CONSENT_COOKIE));

// Stores the choice (cookie, and the anonymous consent log) and tells the page.
export const saveConsent = async (choice: ConsentChoice): Promise<void> => {
  writeCookie(CONSENT_COOKIE, consentCookieValue(choice), CONSENT_MAX_AGE_SECONDS);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  try {
    await Api.post(CONSENT_API.RECORD, choice);
  } catch {
    // The choice already applies; the log entry is evidence only.
  }
};

export const openConsentSettings = () => window.dispatchEvent(new Event(OPEN_EVENT));

// The visitor's choice: undefined until read, null when not made yet.
export const useConsent = (): ConsentChoice | null | undefined => {
  const [consent, setConsent] = useState<ConsentChoice | null | undefined>(undefined);
  useEffect(() => {
    const update = () => setConsent(readConsent());
    update();
    window.addEventListener(CHANGE_EVENT, update);
    return () => window.removeEventListener(CHANGE_EVENT, update);
  }, []);
  return consent;
};

export const useConsentSettingsRequest = (onOpen: () => void) => {
  useEffect(() => {
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [onOpen]);
};
