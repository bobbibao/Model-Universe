import { LRUCache } from 'lru-cache';
import HttpError from '../../../../shared/server/utils/HttpError';

// Address suggestions and map positions from OpenStreetMap data, proxied by the server so the browser never calls the
// geocoder directly. GEOCODER_PROVIDER:
//   photon     (default) Photon by Komoot (https://photon.komoot.io), reachable from Vietnamese networks where
//              openstreetmap.org is often blocked; it already returns the post-2025 ward ("district") names.
//   nominatim  OpenStreetMap Nominatim (usage policy: one request per second, an identifying User-Agent, cached).
// GEOCODER_URL points at a self-hosted instance of either; GEOCODER_EMAIL identifies the shop to Nominatim. Calls are
// serialized one per second and cached either way.

export interface GeoSuggestion {
  label: string;
  street: string;
  latitude: number;
  longitude: number;
  // Administrative names as OpenStreetMap knows them; the client matches them against GHN's master data.
  province: string | null;
  ward: string | null;
}

const env = (name: string) => process.env[name]?.trim() ?? '';
const provider = () => (env('GEOCODER_PROVIDER') === 'nominatim' ? 'nominatim' : 'photon');
const baseUrl = () =>
  (
    env('GEOCODER_URL') ||
    (provider() === 'photon' ? 'https://photon.komoot.io' : 'https://nominatim.openstreetmap.org')
  ).replace(/\/+$/, '');
const cache = new LRUCache<string, GeoSuggestion[]>({ max: 2000, ttl: 7 * 86_400_000 });
let queue: Promise<unknown> = Promise.resolve();
let last = 0;
const USER_AGENT = 'ModelUniverseShop/1.0 (address suggestions)';
// Vietnam (lon/lat): results outside are dropped.
const VIETNAM = { minLon: 102, minLat: 8, maxLon: 110, maxLat: 24 };

// Serialize calls one per second across the process.
const throttled = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(async () => {
    const wait = 1000 - (Date.now() - last);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    last = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
};

const get = async (path: string, params: Record<string, string>) => {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await throttled(() =>
    fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) }),
  ).catch(() => null);
  if (!response?.ok) throw HttpError.serviceUnavailable('Address suggestions are temporarily unavailable.');
  return response.json();
};

interface PhotonFeature {
  properties: Record<string, string | undefined>;
  geometry: { coordinates: [number, number] };
}
const fromPhoton = (feature: PhotonFeature): GeoSuggestion => {
  const p = feature.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name || '';
  const label = [p.name && p.name !== street ? p.name : null, street, p.locality, p.district, p.city || p.state]
    .filter(Boolean)
    .join(', ');
  return {
    label,
    street,
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
    province: p.city || p.state || null,
    ward: p.district || p.locality || null,
  };
};

interface NominatimRow {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}
const fromNominatim = (row: NominatimRow): GeoSuggestion => {
  const address = row.address || {};
  const street = [address.house_number, address.road || address.pedestrian || address.street].filter(Boolean).join(' ');
  return {
    label: row.display_name,
    street: street || row.display_name.split(',')[0],
    latitude: Number(row.lat),
    longitude: Number(row.lon),
    province: address.state || address.city || address.province || null,
    ward: address.quarter || address.suburb || address.village || address.town || address.city_district || null,
  };
};

const inVietnam = (row: GeoSuggestion) =>
  row.latitude >= VIETNAM.minLat &&
  row.latitude <= VIETNAM.maxLat &&
  row.longitude >= VIETNAM.minLon &&
  row.longitude <= VIETNAM.maxLon;

export const searchAddress = async (query: string, provinceName?: string) => {
  const q = [query.trim(), provinceName?.trim()].filter(Boolean).join(', ');
  if (q.length < 3 || q.length > 300) return [];
  const key = `${provider()}:s:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let result: GeoSuggestion[];
  if (provider() === 'photon') {
    const data = (await get('/api/', {
      q,
      limit: '6',
      bbox: `${VIETNAM.minLon},${VIETNAM.minLat},${VIETNAM.maxLon},${VIETNAM.maxLat}`,
    })) as { features?: PhotonFeature[] };
    result = (data.features || []).map(fromPhoton);
  } else {
    const params: Record<string, string> = {
      q,
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': 'vi',
      countrycodes: 'vn',
      limit: '6',
    };
    if (env('GEOCODER_EMAIL')) params.email = env('GEOCODER_EMAIL');
    result = (((await get('/search', params)) || []) as NominatimRow[]).map(fromNominatim);
  }
  result = result.filter(inVietnam);
  cache.set(key, result);
  return result;
};

export const reverseGeocode = async (latitude: number, longitude: number) => {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < VIETNAM.minLat ||
    latitude > VIETNAM.maxLat ||
    longitude < VIETNAM.minLon ||
    longitude > VIETNAM.maxLon
  )
    throw HttpError.badRequest('Choose a position in Vietnam.');
  const key = `${provider()}:r:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit) return hit[0] ?? null;
  let result: GeoSuggestion[] = [];
  if (provider() === 'photon') {
    const data = (await get('/reverse', { lat: String(latitude), lon: String(longitude), limit: '1' })) as {
      features?: PhotonFeature[];
    };
    result = (data.features || []).map(fromPhoton);
  } else {
    const params: Record<string, string> = {
      lat: String(latitude),
      lon: String(longitude),
      zoom: '18',
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': 'vi',
    };
    if (env('GEOCODER_EMAIL')) params.email = env('GEOCODER_EMAIL');
    const row = (await get('/reverse', params)) as NominatimRow & { error?: string };
    result = row && !row.error ? [fromNominatim(row)] : [];
  }
  // The pin stays where the customer put it; only the names come from the lookup.
  result = result.map((row) => ({ ...row, latitude, longitude }));
  cache.set(key, result);
  return result[0] ?? null;
};
