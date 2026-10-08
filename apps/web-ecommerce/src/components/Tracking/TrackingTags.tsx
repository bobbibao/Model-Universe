'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from '@/i18n/navigation';

import { allowedTags } from '@/shared/server/utils/ConsentUtils';
import { TRACKING_IDS, useConsent } from '@/shared/client/utils/consent';
import { trackPageView } from '@/shared/client/utils/tracking';
import { tagLoaderSrc, tagSnippet } from './tagSnippets';

// Loads the marketing tags (Meta Pixel, Google tag, TikTok Pixel) only after the visitor accepted marketing cookies,
// and only those whose public id is configured.
const TrackingTags = () => {
  const consent = useConsent();
  const pathname = usePathname();
  const tags = allowedTags(consent ?? null, TRACKING_IDS);
  const firstPage = useRef(true);

  // The base code counts the first page; client-side navigations are counted here.
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    trackPageView(pathname);
  }, [pathname]);

  return (
    <>
      {tags.map((tag) => {
        const loader = tagLoaderSrc(tag);
        return (
          <span key={tag.platform} hidden>
            {loader && <Script id={`tag-${tag.platform}-loader`} src={loader} strategy="afterInteractive" />}
            <Script id={`tag-${tag.platform}`} strategy="afterInteractive">
              {tagSnippet(tag)}
            </Script>
          </span>
        );
      })}
    </>
  );
};

export default TrackingTags;
