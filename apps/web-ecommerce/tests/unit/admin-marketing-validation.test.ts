import { parseDraft, publishBody } from '../../src/core/server/services/marketing/AdminMarketingValidation';
const REF = 'adm-12345678-1234-1234-1234-123456789abc';
const NOW = new Date('2026-10-07T00:00:00Z');

describe('admin marketing validation', () => {
  it('retains ordered product and media selections and still reads older drafts', () => {
    const draft = parseDraft({
      name: 'Collection',
      channel: 'facebook',
      skus: ['RG-1', 'MG-2'],
      mediaKeys: ['image:7', 'product:MG-2', 'asset:3'],
    });
    expect(draft).toMatchObject({
      sku: 'RG-1',
      skus: ['RG-1', 'MG-2'],
      mediaKeys: ['image:7', 'product:MG-2', 'asset:3'],
    });
    expect(parseDraft({ name: 'Old', channel: 'facebook', sku: 'RG-1', assetId: 5 })).toMatchObject({
      sku: 'RG-1',
      assetId: 5,
    });
  });
  it.each([
    { skus: Array.from({ length: 21 }, (_, i) => `SKU-${i}`) },
    { mediaKeys: Array.from({ length: 11 }, (_, i) => `asset:${i + 1}`) },
    { mediaKeys: ['asset:1', 'asset:1'] },
    { mediaKeys: ['https://outside.example/image.jpg'] },
    { mediaKeys: ['asset:9007199254740993'] },
  ])('rejects malformed or excessive media selections: %j', (selection) => {
    expect(() => parseDraft({ name: 'Post', channel: 'facebook', ...selection })).toThrow();
  });
  it('requires a single creative for ad channels rather than silently dropping images', () => {
    const draft = parseDraft({
      name: 'Ad',
      channel: 'meta',
      sku: 'RG-1',
      mediaKeys: ['asset:1', 'asset:2'],
      headline: 'New',
      primaryText: 'Explore',
    });
    expect(() => publishBody(draft, REF, NOW)).toThrow();
  });
  it('saves incomplete drafts but requires content before posting', () => {
    const draft = parseDraft({ name: 'Thu đông', channel: 'facebook' });
    expect(draft.message).toBe('');
    expect(() => publishBody(draft, REF, NOW)).toThrow();
    expect(publishBody({ ...draft, message: 'Khám phá bộ sưu tập mới' }, REF, NOW)).toMatchObject({
      ref: `${REF}-post`,
      campaign_ref: REF,
    });
  });
  it.each(['https://outside.test', '//outside.test', '/\\outside.test', '/shop with space'])(
    'rejects unsafe landing paths %s',
    (linkPath) => {
      expect(() => parseDraft({ name: 'Campaign', channel: 'facebook', linkPath })).toThrow();
    },
  );
  it('requires Google-specific copy, image-backed Meta copy, and a TikTok video', () => {
    const draft = parseDraft({ name: 'Ads', channel: 'google', dailyBudgetVnd: 100000 });
    expect(() => publishBody(draft, REF, NOW)).toThrow();
    expect(
      publishBody(
        {
          ...draft,
          headlines: ['New collection', 'Shop clothing', 'Autumn essentials'],
          descriptions: ['Explore our autumn styles', 'Find your everyday outfit'],
          keywords: ['clothing'],
        },
        REF,
        NOW,
      ),
    ).toMatchObject({ platform: 'google' });
    expect(() =>
      publishBody({ ...draft, channel: 'meta', headline: 'New collection', primaryText: 'Explore our shop' }, REF, NOW),
    ).toThrow();
    expect(() => publishBody({ ...draft, channel: 'tiktok', adText: 'Explore autumn looks' }, REF, NOW)).toThrow();
  });
  it('refuses stale or near-term post schedules instead of silently publishing immediately', () => {
    const draft = parseDraft({ name: 'Schedule', channel: 'facebook', message: 'Hi' });
    for (const delay of [-60000, 60000, 31 * 86400_000])
      expect(() =>
        publishBody({ ...draft, scheduledAt: new Date(NOW.getTime() + delay).toISOString() }, REF, NOW),
      ).toThrow();
    expect(
      publishBody({ ...draft, scheduledAt: new Date(NOW.getTime() + 3600_000).toISOString() }, REF, NOW),
    ).toHaveProperty('scheduled_at');
  });
  it('rejects negative/fractional budgets and excessively large totals', () => {
    for (const dailyBudgetVnd of [-1, 10000.5])
      expect(() => parseDraft({ name: 'Ads', channel: 'google', dailyBudgetVnd })).toThrow();
    const draft = parseDraft({ name: 'Ads', channel: 'google', dailyBudgetVnd: 1000000000, durationDays: 30 });
    expect(() => publishBody(draft, REF, NOW)).toThrow();
  });
  it('accepts partial multiline draft text and removes empty lines on save', () => {
    expect(parseDraft({ name: 'Draft', channel: 'google', headlines: [' First ', ''] }).headlines).toEqual(['First']);
    expect(() => parseDraft({ name: 'Draft', channel: 'facebook', createdBy: 1 })).toThrow();
  });
});
