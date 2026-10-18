'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import type { DeliveryAddress } from '@/shared/fulfillment';
import type { Map as MapLibreMap, Marker, StyleSpecification } from 'maplibre-gl';

interface Unit {
  id: number;
  name: string;
  extensionNames: string[];
}
interface Suggestion {
  label: string;
  street: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  province: string | null;
  ward: string | null;
}
export type AddressDraft = Partial<DeliveryAddress>;

// Accent-insensitive comparison, also without administrative prefixes ("Thành phố", "Tỉnh", "Phường", "Xã"...).
const plain = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const bare = (value: string) =>
  plain(value).replace(/^(thanh pho|tp\.?|tinh|phuong|xa|thi tran|dac khu|p\.|x\.)\s+/, '');
const matches = (unit: Unit, query: string) => {
  const needle = bare(query);
  return [unit.name, ...unit.extensionNames].some(
    (name) => bare(name).includes(needle) || plain(name).includes(plain(query)),
  );
};
const findUnit = (units: Unit[], name: string | null | undefined) => {
  if (!name) return undefined;
  const target = bare(name);
  return units.find((unit) => [unit.name, ...unit.extensionNames].some((candidate) => bare(candidate) === target));
};

const DEFAULT_CENTER: [number, number] = [10.7769, 106.7009]; // Ho Chi Minh City

// A searchable select over GHN's master data (province or ward), keyboard friendly.
function UnitSelect({
  label,
  units,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  units: Unit[];
  value?: number;
  onChange: (unit: Unit) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = units.find((unit) => unit.id === value);
  const filtered = useMemo(
    () => (query ? units.filter((unit) => matches(unit, query)) : units).slice(0, 80),
    [units, query],
  );
  return (
    <label className="mu-field relative">
      {label}
      <input
        value={open ? query : selected?.name || ''}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && filtered[0]) {
            event.preventDefault();
            onChange(filtered[0]);
            setOpen(false);
          }
        }}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-[1000] max-h-64 overflow-auto rounded-md border border-stroke bg-white shadow-lg dark:border-store-card dark:bg-store-panel"
          role="listbox"
        >
          {filtered.map((unit) => (
            <li key={unit.id}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-2 dark:hover:bg-store-card ${unit.id === value ? 'font-semibold' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(unit);
                  setOpen(false);
                }}
              >
                {unit.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

// GHN-style address entry (two-level administrative model): province/city → ward/commune from GHN's master data,
// then the house number and street with suggestions, and a map whose pin can be dragged to the exact door. Used for
// the customer's delivery address and the shop's pickup address.
export default function AddressPicker({
  value,
  onChange: onChangeProp,
  idPrefix = 'address',
}: {
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
  idPrefix?: string;
}) {
  // Callers may pass a new function every render; effects use the latest one without re-running.
  const onChangeRef = useRef(onChangeProp);
  onChangeRef.current = onChangeProp;
  const onChange = useRef((next: AddressDraft) => onChangeRef.current(next)).current;
  const t = useTranslations('address');
  const [provinces, setProvinces] = useState<Unit[]>([]);
  const [wards, setWards] = useState<Unit[]>([]);
  const [failed, setFailed] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const typing = useRef(false);
  // The map's event handlers outlive renders: they read the latest master data through refs.
  const provincesRef = useRef<Unit[]>([]);
  const wardsRef = useRef<Unit[]>([]);
  provincesRef.current = provinces;
  wardsRef.current = wards;

  useEffect(() => {
    void Api.get('/shipping/provinces')
      .then((response) => setProvinces(response.data))
      .catch(() => setFailed(true));
  }, []);

  // Saved addresses and map suggestions arrive as names: resolve them to GHN ids.
  useEffect(() => {
    if (!value.provinceId && value.provinceName && provinces.length) {
      const province = findUnit(provinces, value.provinceName);
      if (province) onChange({ ...latest.current, provinceId: province.id, provinceName: province.name });
    }
  }, [value.provinceId, value.provinceName, provinces, onChange]);

  useEffect(() => {
    setWards([]);
    if (!value.provinceId) return;
    let active = true;
    void Api.get('/shipping/wards', { params: { provinceId: value.provinceId } })
      .then((response) => {
        if (!active) return;
        setWards(response.data);
        const current = latest.current;
        if (!current.wardId && current.wardName) {
          const ward = findUnit(response.data, current.wardName);
          if (ward) onChange({ ...current, wardId: ward.id, wardName: ward.name });
        }
      })
      .catch(() => setFailed(true));
    return () => {
      active = false;
    };
  }, [value.provinceId, onChange]);

  // Openmap suggestions carry a place id instead of coordinates: resolve it first.
  const chooseSuggestion = async (suggestion: Suggestion) => {
    if (!suggestion.placeId || (suggestion.latitude && suggestion.longitude)) return applySuggestion(suggestion);
    try {
      const place = (await Api.get('/shipping/place', { params: { id: suggestion.placeId } }))
        .data as Suggestion | null;
      applySuggestion(place ? { ...place, street: suggestion.street || place.street } : suggestion);
    } catch {
      applySuggestion(suggestion);
    }
  };

  const applySuggestion = (suggestion: Suggestion, keepStreet = false) => {
    const province = findUnit(provincesRef.current, suggestion.province);
    const next: AddressDraft = {
      ...latest.current,
      street: keepStreet ? latest.current.street : suggestion.street,
      ...(suggestion.latitude && suggestion.longitude
        ? { latitude: suggestion.latitude, longitude: suggestion.longitude }
        : {}),
    };
    if (province && province.id !== latest.current.provinceId)
      Object.assign(next, {
        provinceId: province.id,
        provinceName: province.name,
        wardId: undefined,
        wardName: suggestion.ward || undefined,
      });
    else if (suggestion.ward && province) {
      const ward = findUnit(wardsRef.current, suggestion.ward);
      if (ward) Object.assign(next, { wardId: ward.id, wardName: ward.name });
    }
    // A chosen suggestion is not a new search.
    typing.current = false;
    onChange(next);
    setSuggestions([]);
  };

  // The map (MapLibre GL): the Openmap.vn style when the shop has a key, otherwise CARTO raster tiles of OpenStreetMap
  // data (tile.openstreetmap.org is blocked by some Vietnamese networks). Created once on the client.
  useEffect(() => {
    let disposed = false;
    void Promise.all([import('maplibre-gl'), Api.get('/shipping/config').catch(() => ({ data: {} }))]).then(
      ([module, config]) => {
        const maplibregl = module.default;
        if (disposed || !mapElement.current || map.current) return;
        const styleUrl = (config.data as { mapStyleUrl?: string | null }).mapStyleUrl;
        const fallback: StyleSpecification = {
          version: 8,
          sources: {
            carto: {
              type: 'raster',
              tiles: ['a', 'b', 'c', 'd'].map(
                (sub) => `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png`,
              ),
              tileSize: 256,
              attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            },
          },
          layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
        };
        const start: [number, number] =
          latest.current.latitude && latest.current.longitude
            ? [latest.current.longitude, latest.current.latitude]
            : [DEFAULT_CENTER[1], DEFAULT_CENTER[0]];
        const instance = new maplibregl.Map({
          container: mapElement.current,
          style: styleUrl || fallback,
          center: start,
          zoom: latest.current.latitude ? 16 : 11,
          scrollZoom: false,
          attributionControl: { compact: true },
        });
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        const element = document.createElement('div');
        element.className = 'address-pin';
        element.innerHTML = '<span></span>';
        const pin = new maplibregl.Marker({ element, draggable: true, anchor: 'bottom' })
          .setLngLat(start)
          .addTo(instance);
        const locate = async (lat: number, lng: number) => {
          try {
            const found = (await Api.get('/shipping/reverse', { params: { lat, lng } })).data as Suggestion | null;
            if (found) applySuggestion(found);
            else onChange({ ...latest.current, latitude: lat, longitude: lng });
          } catch {
            onChange({ ...latest.current, latitude: lat, longitude: lng });
          }
        };
        pin.on('dragend', () => {
          const position = pin.getLngLat();
          void locate(position.lat, position.lng);
        });
        instance.on('click', (event) => {
          pin.setLngLat(event.lngLat);
          void locate(event.lngLat.lat, event.lngLat.lng);
        });
        map.current = instance;
        marker.current = pin;
      },
    );
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value.latitude && value.longitude && map.current && marker.current) {
      marker.current.setLngLat([value.longitude, value.latitude]);
      map.current.easeTo({ center: [value.longitude, value.latitude], zoom: Math.max(map.current.getZoom(), 16) });
    }
  }, [value.latitude, value.longitude]);

  // Street suggestions while typing, limited to the chosen province.
  useEffect(() => {
    if (!typing.current) return;
    const query = value.street?.trim() || '';
    if (query.length < 5) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      const q = [query, value.wardName].filter(Boolean).join(', ');
      void Api.get('/shipping/geocode', { params: { q, province: value.provinceName || '' } })
        .then((response) => setSuggestions(response.data))
        .catch(() => setSuggestions([]));
    }, 700);
    return () => clearTimeout(timer);
  }, [value.street, value.wardName, value.provinceName]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setLocating(false);
        try {
          const found = (
            await Api.get('/shipping/reverse', {
              params: { lat: position.coords.latitude, lng: position.coords.longitude },
            })
          ).data as Suggestion | null;
          if (found) applySuggestion(found);
        } catch {
          onChange({ ...latest.current, latitude: position.coords.latitude, longitude: position.coords.longitude });
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-3">
      {failed && <p className="mu-note text-danger">{t('masterDataUnavailable')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <UnitSelect
          label={t('province')}
          placeholder={t('provincePlaceholder')}
          units={provinces}
          value={value.provinceId}
          onChange={(province) =>
            onChange({
              ...latest.current,
              provinceId: province.id,
              provinceName: province.name,
              wardId: undefined,
              wardName: undefined,
            })
          }
        />
        <UnitSelect
          label={t('ward')}
          placeholder={t(value.provinceId ? 'wardPlaceholder' : 'chooseProvinceFirst')}
          units={wards}
          value={value.wardId}
          disabled={!value.provinceId}
          onChange={(ward) => onChange({ ...latest.current, wardId: ward.id, wardName: ward.name })}
        />
      </div>
      <label className="mu-field relative" htmlFor={`${idPrefix}-street`}>
        {t('street')}
        <input
          id={`${idPrefix}-street`}
          value={value.street || ''}
          placeholder={t('streetPlaceholder')}
          autoComplete="street-address"
          onChange={(event) => {
            typing.current = true;
            onChange({ ...latest.current, street: event.target.value });
          }}
          onBlur={() => setTimeout(() => setSuggestions([]), 200)}
        />
        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-[1000] max-h-64 overflow-auto rounded-md border border-stroke bg-white shadow-lg dark:border-store-card dark:bg-store-panel">
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId || `${suggestion.latitude},${suggestion.longitude}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-2 dark:hover:bg-store-card"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void chooseSuggestion(suggestion)}
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="mu-note">{t('mapHint')}</span>
        <button type="button" className="underline" onClick={useMyLocation} disabled={locating}>
          {t(locating ? 'locating' : 'useMyLocation')}
        </button>
      </div>
      <div
        ref={mapElement}
        className="address-map h-64 w-full overflow-hidden rounded-md border border-stroke dark:border-store-card"
      />
    </div>
  );
}
