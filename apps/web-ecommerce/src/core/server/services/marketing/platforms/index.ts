import type { AdPlatformName } from '../../agent/AgentLimits';
import { FacebookGraphPage } from './FacebookGraphPage';
import { FakeAdPlatform, FakeFacebookPage } from './FakePlatforms';
import { GoogleAdsClient, type GoogleAdsCredentials } from './GoogleAdsClient';
import { MetaAdsClient } from './MetaAdsClient';
import { TikTokAdsClient } from './TikTokAdsClient';
import type { AdPlatformClient, FacebookPageClient, PlatformMode } from './types';

export * from './types';
export { FakeAdPlatform, FakeFacebookPage } from './FakePlatforms';

// Which client each platform uses: `<NAME>_MODE=fake` (the default) or `live`. A live platform needs its credentials;
// `assertMarketingConfig()` runs at server start, so a live mode without them stops the server instead of failing
// on the first agent request. Credentials are web-only; the agent never sees them.

const MODE_VARIABLES = {
  facebook: 'FACEBOOK_PAGE_MODE',
  meta: 'META_ADS_MODE',
  google: 'GOOGLE_ADS_MODE',
  tiktok: 'TIKTOK_ADS_MODE',
} as const;
type PlatformKey = keyof typeof MODE_VARIABLES;

const REQUIRED: Record<PlatformKey, string[]> = {
  facebook: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'],
  meta: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'FACEBOOK_PAGE_ID'],
  google: [
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
  ],
  tiktok: ['TIKTOK_ACCESS_TOKEN', 'TIKTOK_ADVERTISER_ID', 'TIKTOK_IDENTITY_ID'],
};

export const env = (name: string) => process.env[name]?.trim() ?? '';

export const platformMode = (platform: PlatformKey): PlatformMode => {
  const value = env(MODE_VARIABLES[platform]) || 'fake';
  if (value !== 'fake' && value !== 'live') throw new Error(`${MODE_VARIABLES[platform]} must be fake or live`);
  return value;
};

// The shop's public address, for the links in ads and posts (`http://localhost:3000` in development).
export const shopPublicUrl = () => (env('SHOP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/+$/, '');

// Fails when a live platform lacks a credential, or a live platform has no public shop address to link to.
export const assertMarketingConfig = () => {
  const problems: string[] = [];
  const live = (Object.keys(MODE_VARIABLES) as PlatformKey[]).filter((platform) => platformMode(platform) === 'live');
  for (const platform of live) {
    const missing = REQUIRED[platform].filter((name) => !env(name));
    if (missing.length) problems.push(`${MODE_VARIABLES[platform]}=live needs ${missing.join(', ')}`);
  }
  if (live.length && !/^https:\/\//.test(env('SHOP_PUBLIC_URL'))) {
    problems.push('live platforms need SHOP_PUBLIC_URL (https://...) for their links');
  }
  // Server-side conversion events (ConversionService) for each configured browser tag.
  const conversions = env('CONVERSIONS_MODE') || 'fake';
  if (conversions !== 'fake' && conversions !== 'live') problems.push('CONVERSIONS_MODE must be fake or live');
  if (conversions === 'live') {
    const needs: string[] = [];
    if (env('NEXT_PUBLIC_META_PIXEL_ID')) needs.push('META_CAPI_TOKEN');
    if (env('NEXT_PUBLIC_TIKTOK_PIXEL_ID')) needs.push('TIKTOK_EVENTS_TOKEN');
    if (env('NEXT_PUBLIC_GOOGLE_TAG_ID') && env('NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL')) {
      needs.push(...REQUIRED.google, 'GOOGLE_ADS_CONVERSION_ACTION_ID');
    }
    const missing = needs.filter((name) => !env(name));
    if (missing.length) problems.push(`CONVERSIONS_MODE=live needs ${missing.join(', ')}`);
  }
  if (problems.length) throw new Error(`Marketing configuration: ${problems.join('; ')}`);
};

export const googleAdsCredentials = (): GoogleAdsCredentials => ({
  clientId: env('GOOGLE_ADS_CLIENT_ID'),
  clientSecret: env('GOOGLE_ADS_CLIENT_SECRET'),
  developerToken: env('GOOGLE_ADS_DEVELOPER_TOKEN'),
  refreshToken: env('GOOGLE_ADS_REFRESH_TOKEN'),
  customerId: env('GOOGLE_ADS_CUSTOMER_ID'),
  loginCustomerId: env('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || undefined,
});

const adClients = new Map<AdPlatformName, AdPlatformClient>();
let pageClient: FacebookPageClient | null = null;

const liveAdClient = (platform: AdPlatformName): AdPlatformClient => {
  switch (platform) {
    case 'meta':
      return new MetaAdsClient(
        env('META_ACCESS_TOKEN'),
        env('META_AD_ACCOUNT_ID'),
        env('FACEBOOK_PAGE_ID'),
        env('NEXT_PUBLIC_META_PIXEL_ID') || undefined,
      );
    case 'google':
      return new GoogleAdsClient(googleAdsCredentials());
    case 'tiktok':
      return new TikTokAdsClient({
        accessToken: env('TIKTOK_ACCESS_TOKEN'),
        advertiserId: env('TIKTOK_ADVERTISER_ID'),
        identityId: env('TIKTOK_IDENTITY_ID'),
        pixelId: env('NEXT_PUBLIC_TIKTOK_PIXEL_ID') || undefined,
      });
  }
};

export const adPlatform = (platform: AdPlatformName): AdPlatformClient => {
  let client = adClients.get(platform);
  if (!client) {
    client = platformMode(platform) === 'live' ? liveAdClient(platform) : new FakeAdPlatform(platform);
    adClients.set(platform, client);
  }
  return client;
};

export const facebookPage = (): FacebookPageClient => {
  if (!pageClient) {
    pageClient =
      platformMode('facebook') === 'live'
        ? new FacebookGraphPage(
            env('FACEBOOK_PAGE_ID'),
            env('FACEBOOK_PAGE_ACCESS_TOKEN'),
            env('META_GRAPH_API_VERSION') || 'v24.0',
          )
        : new FakeFacebookPage();
  }
  return pageClient;
};

// Tests: forget the clients, so the next call builds them from the current environment.
export const resetPlatforms = () => {
  adClients.clear();
  pageClient = null;
};
