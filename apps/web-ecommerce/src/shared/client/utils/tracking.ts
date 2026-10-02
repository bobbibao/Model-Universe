'use client';

import { TRACKING_IDS } from './consent';

// The shop's conversion events for the marketing tags. The tags' globals exist only after marketing consent
// (TrackingTags), so without consent these calls do nothing. Amounts are whole VND. A purchase carries the order id
// as its event id, shared with the server-side conversion APIs for deduplication.

type Fn = (...args: unknown[]) => void;
declare global {
  interface Window {
    fbq?: Fn;
    gtag?: Fn;
    ttq?: { track: Fn; page: Fn };
  }
}

// `id` is our product id (the content id every platform receives, also from the server-side events).
export interface TrackedItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

const value = (items: TrackedItem[]) => items.reduce((sum, item) => sum + item.price * item.quantity, 0);

const send = (meta: string, google: string, tiktok: string, items: TrackedItem[], total: number, eventId?: string) => {
  const ids = items.map((item) => item.id);
  window.fbq?.(
    'track',
    meta,
    { content_ids: ids, content_type: 'product', value: total, currency: 'VND' },
    ...(eventId ? [{ eventID: eventId }] : []),
  );
  window.gtag?.('event', google, {
    currency: 'VND',
    value: total,
    items: items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
    ...(eventId ? { transaction_id: eventId } : {}),
  });
  window.ttq?.track(
    tiktok,
    {
      contents: items.map((item) => ({ content_id: item.id, content_name: item.name, quantity: item.quantity })),
      content_type: 'product',
      value: total,
      currency: 'VND',
    },
    ...(eventId ? [{ event_id: eventId }] : []),
  );
};

export const trackPageView = (path: string) => {
  window.fbq?.('track', 'PageView');
  window.gtag?.('event', 'page_view', { page_path: path });
  window.ttq?.page();
};

export const trackViewContent = (item: TrackedItem) =>
  send('ViewContent', 'view_item', 'ViewContent', [item], item.price);

export const trackAddToCart = (item: TrackedItem) =>
  send('AddToCart', 'add_to_cart', 'AddToCart', [item], item.price * item.quantity);

export const trackPurchase = (orderId: number, total: number, items: TrackedItem[]) => {
  const eventId = String(orderId);
  send('Purchase', 'purchase', 'CompletePayment', items, total || value(items), eventId);
  const { googleTagId, googleAdsConversionLabel } = TRACKING_IDS;
  if (googleTagId && googleAdsConversionLabel) {
    window.gtag?.('event', 'conversion', {
      send_to: `${googleTagId}/${googleAdsConversionLabel}`,
      value: total,
      currency: 'VND',
      transaction_id: eventId,
    });
  }
};
