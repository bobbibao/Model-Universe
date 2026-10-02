import axios from 'axios';
import { createHash } from 'crypto';
import { ResourceNames, services } from 'google-ads-api';
import ConversionEventModel, {
  type ConversionPlatform,
  type ConversionStatus,
} from '../../database/client/models/ConversionEvent.Model';
import type OrderModel from '../../database/client/models/Order.Model';
import Logger from '../../../../shared/server/utils/logger';
import type { ConsentChoice } from '../../../../shared/server/utils/ConsentUtils';
import { callGoogle, googleCustomer, vnDateTime } from './platforms/GoogleAdsClient';
import { env, googleAdsCredentials, PlatformError } from './platforms';

// Server-side purchase events (docs/GROWTH_AGENT.md section 6), sent once an order is placed, one per platform whose
// browser tag is configured: Meta Conversions API, TikTok Events API, and a Google Ads offline conversion keyed by the
// order's gclid. `event_id` is the order id, the same as the browser's Purchase event, so each platform counts the
// purchase once. Payloads carry the value (VND), the SKUs and the click id; the customer's email and phone, hashed,
// only with marketing consent. `CONVERSIONS_MODE=fake` (the default) records the payloads without sending them.
// Every attempt is a `conversion_event` row (unique per order and platform), and a failure never fails the order.

const META_GRAPH_VERSION = 'v24.0';
const TIKTOK_EVENTS_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export interface PurchaseLine {
  sku: string;
  quantity: number;
  unitPriceVnd: number;
}

export interface Purchase {
  order: Pick<OrderModel, 'id' | 'total' | 'phone' | 'createdAt' | 'clickId' | 'clickIdType'>;
  email: string | null;
  lines: PurchaseLine[];
  consent: ConsentChoice | null;
}

type Attempt = { status: ConversionStatus; payload: Record<string, unknown>; error?: string };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const hashEmail = (email: string) => sha256(email.trim().toLowerCase());
// Vietnamese numbers in E.164 without '+': 0912 345 678 -> 84912345678.
const hashPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return sha256(digits.startsWith('0') ? `84${digits.slice(1)}` : digits);
};

export const conversionsMode = () => (env('CONVERSIONS_MODE') === 'live' ? 'live' : 'fake');

// The platforms whose browser tag is configured (no tag, no server event).
export const conversionPlatforms = (): ConversionPlatform[] => [
  ...(env('NEXT_PUBLIC_META_PIXEL_ID') ? (['meta'] as const) : []),
  ...(env('NEXT_PUBLIC_GOOGLE_TAG_ID') && env('NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL') ? (['google'] as const) : []),
  ...(env('NEXT_PUBLIC_TIKTOK_PIXEL_ID') ? (['tiktok'] as const) : []),
];

export default class ConversionService {
  // Builds, sends (live) or records (fake) the purchase for every configured platform. Never throws.
  async recordPurchase(purchase: Purchase): Promise<void> {
    for (const platform of conversionPlatforms()) {
      let attempt: Attempt;
      try {
        attempt = await this.attempt(platform, purchase);
      } catch (error) {
        attempt = { status: 'failed', payload: {}, error: (error as Error).message };
      }
      try {
        await ConversionEventModel.findOrCreate({
          where: { orderId: purchase.order.id, platform },
          defaults: { eventId: String(purchase.order.id), ...attempt, error: attempt.error ?? null },
        });
      } catch (error) {
        Logger.ERROR(`Could not record the ${platform} conversion of order ${purchase.order.id}:`, error);
      }
    }
  }

  private async attempt(platform: ConversionPlatform, purchase: Purchase): Promise<Attempt> {
    const payload =
      platform === 'meta'
        ? this.metaPayload(purchase)
        : platform === 'tiktok'
          ? this.tiktokPayload(purchase)
          : this.googlePayload(purchase);
    if (!payload) return { status: 'skipped', payload: {} };
    if (conversionsMode() === 'fake') return { status: 'fake', payload };
    try {
      if (platform === 'meta') await this.sendMeta(payload);
      else if (platform === 'tiktok') await this.sendTikTok(payload);
      else await this.sendGoogle(payload);
      return { status: 'sent', payload };
    } catch (error) {
      const message = error instanceof PlatformError || error instanceof Error ? error.message : String(error);
      Logger.WARN(`Conversion event for order ${purchase.order.id} on ${platform} failed: ${message}`);
      return { status: 'failed', payload, error: message.slice(0, 1000) };
    }
  }

  private identity(purchase: Purchase) {
    if (!purchase.consent?.marketing) return { email: null, phone: null };
    return {
      email: purchase.email ? hashEmail(purchase.email) : null,
      phone: purchase.order.phone ? hashPhone(purchase.order.phone) : null,
    };
  }

  private value(purchase: Purchase) {
    return {
      value: purchase.order.total,
      currency: 'VND',
      ids: purchase.lines.map((line) => line.sku),
      items: purchase.lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }

  // Meta needs something to match the buyer: the click id (fbc) or, with consent, the hashed email or phone.
  metaPayload(purchase: Purchase): Record<string, unknown> | null {
    const { order } = purchase;
    const time = Math.floor(new Date(order.createdAt).getTime() / 1000);
    const who = this.identity(purchase);
    const userData = {
      ...(order.clickIdType === 'fbclid' && order.clickId ? { fbc: `fb.1.${time * 1000}.${order.clickId}` } : {}),
      ...(who.email ? { em: [who.email] } : {}),
      ...(who.phone ? { ph: [who.phone] } : {}),
    };
    if (Object.keys(userData).length === 0) return null;
    const value = this.value(purchase);
    return {
      data: [
        {
          event_name: 'Purchase',
          event_time: time,
          event_id: String(order.id),
          action_source: 'website',
          user_data: userData,
          custom_data: {
            currency: value.currency,
            value: value.value,
            content_ids: value.ids,
            content_type: 'product',
            num_items: value.items,
          },
        },
      ],
    };
  }

  tiktokPayload(purchase: Purchase): Record<string, unknown> | null {
    const { order } = purchase;
    const who = this.identity(purchase);
    const user = {
      ...(order.clickIdType === 'ttclid' && order.clickId ? { ttclid: order.clickId } : {}),
      ...(who.email ? { email: who.email } : {}),
      ...(who.phone ? { phone: who.phone } : {}),
    };
    if (Object.keys(user).length === 0) return null;
    return {
      event_source: 'web',
      event_source_id: env('NEXT_PUBLIC_TIKTOK_PIXEL_ID'),
      data: [
        {
          event: 'CompletePayment',
          event_time: Math.floor(new Date(order.createdAt).getTime() / 1000),
          event_id: String(order.id),
          user,
          properties: {
            currency: 'VND',
            value: order.total,
            content_type: 'product',
            contents: purchase.lines.map((line) => ({
              content_id: line.sku,
              quantity: line.quantity,
              price: line.unitPriceVnd,
            })),
          },
        },
      ],
    };
  }

  // Only orders that came from a Google ad click (gclid) can be uploaded.
  googlePayload(purchase: Purchase): Record<string, unknown> | null {
    const { order } = purchase;
    if (order.clickIdType !== 'gclid' || !order.clickId) return null;
    return {
      gclid: order.clickId,
      conversion_date_time: `${vnDateTime(new Date(order.createdAt))}+07:00`,
      conversion_value: order.total,
      currency_code: 'VND',
      order_id: String(order.id),
    };
  }

  private async sendMeta(payload: Record<string, unknown>) {
    const url = `https://graph.facebook.com/${env('META_GRAPH_API_VERSION') || META_GRAPH_VERSION}/${env('NEXT_PUBLIC_META_PIXEL_ID')}/events`;
    await axios.post(url, { ...payload, access_token: env('META_CAPI_TOKEN') }, { timeout: 10_000 });
  }

  private async sendTikTok(payload: Record<string, unknown>) {
    const { data } = await axios.post(TIKTOK_EVENTS_URL, payload, {
      headers: { 'Access-Token': env('TIKTOK_EVENTS_TOKEN'), 'Content-Type': 'application/json' },
      timeout: 10_000,
    });
    if (data?.code !== 0) throw new PlatformError('tiktok', data?.message ?? 'event refused', false);
  }

  private async sendGoogle(payload: Record<string, unknown>) {
    const credentials = googleAdsCredentials();
    const customer = googleCustomer(credentials);
    const conversion = {
      ...payload,
      conversion_action: ResourceNames.conversionAction(credentials.customerId, env('GOOGLE_ADS_CONVERSION_ACTION_ID')),
    };
    const response = await callGoogle(() =>
      customer.conversionUploads.uploadClickConversions(
        new services.UploadClickConversionsRequest({
          customer_id: credentials.customerId,
          conversions: [conversion],
          partial_failure: true, // required by the API for click conversion uploads
        }),
      ),
    );
    if (response.partial_failure_error?.message) {
      throw new PlatformError('google', response.partial_failure_error.message, false);
    }
  }
}
