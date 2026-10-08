'use client';

import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';

import { writeCookie } from '@/shared/client/utils/cookies';
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  attributionFromUrl,
} from '@/shared/server/utils/AttributionUtils';

// Remembers where a visit came from (UTM tags, ad click id) for 30 days; a later direct visit keeps it (last
// non-direct click). The order stores it when it is placed (OrderService.placeOrder). Renders nothing.
const AttributionCapture = () => {
  const pathname = usePathname();

  useEffect(() => {
    const attribution = attributionFromUrl(new URLSearchParams(window.location.search), window.location.pathname);
    if (attribution) writeCookie(ATTRIBUTION_COOKIE, JSON.stringify(attribution), ATTRIBUTION_MAX_AGE_SECONDS);
  }, [pathname]);

  return null;
};

export default AttributionCapture;
