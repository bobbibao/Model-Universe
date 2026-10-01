import {
  adPlatform,
  assertMarketingConfig,
  facebookPage,
  FakeAdPlatform,
  FakeFacebookPage,
  resetPlatforms,
} from '../../src/core/server/services/marketing/platforms';

// `*_MODE=fake` is the default; a live platform without its credentials stops the server at start.
describe('marketing platform configuration', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetPlatforms();
  });

  it('uses the fakes by default', () => {
    expect(() => assertMarketingConfig()).not.toThrow();
    expect(adPlatform('meta')).toBeInstanceOf(FakeAdPlatform);
    expect(adPlatform('google').mode).toBe('fake');
    expect(facebookPage()).toBeInstanceOf(FakeFacebookPage);
  });

  it('refuses a live platform without its credentials or a public https address', () => {
    process.env.META_ADS_MODE = 'live';
    expect(() => assertMarketingConfig()).toThrow(
      /META_ADS_MODE=live needs META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, FACEBOOK_PAGE_ID.*SHOP_PUBLIC_URL/,
    );
    Object.assign(process.env, {
      META_ACCESS_TOKEN: 't',
      META_AD_ACCOUNT_ID: '1',
      FACEBOOK_PAGE_ID: '2',
      SHOP_PUBLIC_URL: 'https://shop.example.vn',
    });
    expect(() => assertMarketingConfig()).not.toThrow();
    expect(adPlatform('meta').mode).toBe('live');
  });

  it('refuses an unknown mode and live conversions without their tokens', () => {
    process.env.TIKTOK_ADS_MODE = 'sandbox';
    expect(() => assertMarketingConfig()).toThrow(/TIKTOK_ADS_MODE must be fake or live/);
    delete process.env.TIKTOK_ADS_MODE;
    Object.assign(process.env, { CONVERSIONS_MODE: 'live', NEXT_PUBLIC_META_PIXEL_ID: '123' });
    expect(() => assertMarketingConfig()).toThrow(/CONVERSIONS_MODE=live needs META_CAPI_TOKEN/);
  });
});
