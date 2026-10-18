import HttpError from '../../../../shared/server/utils/HttpError';
import type { GeoSuggestion } from './Geocoder';

// Openmap.vn (https://docs.openmap.vn): Vietnamese address search with province → district → ward names
// (`admin_v2=false`), the units SuperAI and the carriers route by. Server-side key OPENMAP_API_KEY for autocomplete,
// place detail and reverse geocoding; the map style
// uses OPENMAP_MAP_KEY (a key restricted to the shop's domain in the Openmap dashboard, since the browser sees it), or
// the same key when no separate one is set.

const env = (name: string) => process.env[name]?.trim() ?? '';
export const openMapKey = () => env('OPENMAP_API_KEY');
export const openMapStyleUrl = () => {
  const key = env('OPENMAP_MAP_KEY') || openMapKey();
  return key ? `https://maptiles.openmap.vn/styles/day-v1/style.json?apikey=${encodeURIComponent(key)}` : null;
};
const BASE = 'https://mapapis.openmap.vn/v1';

const get = async <T>(path: string, params: Record<string, string>): Promise<T> => {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries({ ...params, admin_v2: 'false', apikey: openMapKey() }))
    url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!response?.ok) throw HttpError.serviceUnavailable('Address suggestions are temporarily unavailable.');
  return (await response.json()) as T;
};

const WARD = /^(phường|xã|thị trấn|đặc khu)\s/i;
const DISTRICT = /^(quận|huyện|thị xã|thành phố)\s/i;
const PROVINCE = /^(thành phố|tỉnh)\s/i;

// "12 Lê Lợi, phường Bến Nghé, quận 1, thành phố Hồ Chí Minh" → street, ward, district, province. The province is the
// last part; the district the one before it; the ward the one before that (each only when its prefix fits).
export const splitAddress = (parts: string[]) => {
  const clean = parts.map((part) => part.trim()).filter(Boolean);
  if (clean.length < 2) return { street: clean.join(', '), ward: null, district: null, province: null };
  let index = clean.length - 1;
  const province = clean[index];
  if (!PROVINCE.test(province) && clean.length < 3) return { street: clean[0], ward: null, district: null, province };
  index -= 1;
  const district = index >= 0 && DISTRICT.test(clean[index]) ? clean[index--] : null;
  const ward = index >= 0 && WARD.test(clean[index]) ? clean[index--] : null;
  return { street: clean.slice(0, index + 1).join(', '), ward, district, province };
};

interface Prediction {
  description: string;
  place_id: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
  terms?: { value: string }[];
}
interface GoogleResult {
  formatted_address?: string;
  name?: string;
  geometry?: { location?: { lat: number; lng: number } };
  address_components?: { long_name: string }[];
  place_id?: string;
}

const fromResult = (result: GoogleResult): GeoSuggestion | null => {
  const location = result.geometry?.location;
  if (!location) return null;
  const parts = result.formatted_address
    ? result.formatted_address.split(',')
    : (result.address_components || []).map((part) => part.long_name);
  const { street, ward, district, province } = splitAddress(parts);
  return {
    label: result.formatted_address || result.name || street,
    street: street || result.name || '',
    latitude: location.lat,
    longitude: location.lng,
    province,
    district,
    ward,
  };
};

// Suggestions without coordinates; the chosen one is resolved with `placeDetail`.
export const autocomplete = async (query: string, near?: { latitude: number; longitude: number } | null) => {
  const data = await get<{ predictions?: Prediction[] }>('/autocomplete', {
    input: query,
    ...(near ? { location: `${near.latitude},${near.longitude}`, radius: '50' } : {}),
  });
  return (data.predictions || []).slice(0, 6).map((prediction) => {
    const { street, ward, district, province } = splitAddress(prediction.description.split(','));
    return {
      label: prediction.description,
      street: street || prediction.structured_formatting?.main_text || '',
      placeId: prediction.place_id,
      province,
      district,
      ward,
    };
  });
};

export const placeDetail = async (placeId: string) => {
  const data = await get<{ result?: GoogleResult }>('/place', { ids: placeId, format: 'google' });
  return data.result ? fromResult(data.result) : null;
};

export const reverse = async (latitude: number, longitude: number) => {
  const data = await get<{ results?: GoogleResult[] }>('/geocode/reverse', { latlng: `${latitude},${longitude}` });
  const first = data.results?.[0];
  const result = first ? fromResult(first) : null;
  return result ? { ...result, latitude, longitude } : null;
};
