import { attributionFromUrl, parseAttributionCookie } from '../../src/shared/server/utils/AttributionUtils';

describe('attribution', () => {
  it('reads UTM tags and the ad click id from the landing URL', () => {
    const attribution = attributionFromUrl(
      new URLSearchParams('utm_source=google&utm_medium=cpc&utm_campaign=ag-1a2b3c4d-o1&gclid=Cj0KCQ'),
      '/shop',
    );
    expect(attribution).toEqual({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'ag-1a2b3c4d-o1',
      utmContent: null,
      utmTerm: null,
      clickId: 'Cj0KCQ',
      clickIdType: 'gclid',
      landingPath: '/shop',
    });
  });

  it('ignores a direct visit, so the previous click stays (last non-direct click)', () => {
    expect(attributionFromUrl(new URLSearchParams('q=giay'), '/search')).toBeNull();
    expect(attributionFromUrl(new URLSearchParams('utm_source=%20'), '/')).toBeNull();
  });

  it('accepts a click id alone and truncates long values', () => {
    const attribution = attributionFromUrl(new URLSearchParams(`ttclid=${'x'.repeat(400)}`), '/');
    expect(attribution?.clickIdType).toBe('ttclid');
    expect(attribution?.clickId).toHaveLength(255);
  });

  it('validates the cookie field by field', () => {
    expect(parseAttributionCookie('not json')).toBeNull();
    expect(parseAttributionCookie('[]')).toBeNull();
    expect(parseAttributionCookie(undefined)).toBeNull();
    expect(
      parseAttributionCookie(
        JSON.stringify({ utmSource: 'facebook', clickId: 'abc', clickIdType: 'evil', landingPath: '//evil.example' }),
      ),
    ).toMatchObject({ utmSource: 'facebook', clickId: null, clickIdType: null, landingPath: null });
    expect(parseAttributionCookie(JSON.stringify({ landingPath: '/' }))).toBeNull();
  });
});
