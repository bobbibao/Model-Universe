'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import { formatDeliveryAddress, type DeliveryAddress } from '@/shared/fulfillment';
import type { CustomerAddress } from '@/shared/types/customer-tools';

// The customer's saved delivery addresses (every paid checkout adds its address) as one-tap cards above the address
// form. A card fills the recipient, phone and the full address; "New address" clears it for typing.
export default function SavedAddressCards({
  selected,
  onSelect,
  onNew,
}: {
  selected: number | null;
  onSelect: (row: CustomerAddress) => void;
  onNew: () => void;
}) {
  const t = useTranslations('checkout.savedAddresses'),
    { user } = useCurrentUser();
  const [rows, setRows] = useState<CustomerAddress[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setRows([]);
    if (user)
      void Api.get('/addresses')
        .then((response: { data: CustomerAddress[] }) => active && setRows(response.data))
        .catch(() => undefined)
        .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [user]);
  // The most recent address is preselected once, so a returning customer only reviews it.
  useEffect(() => {
    if (loaded && selected === null && rows[0]?.delivery) onSelect(rows[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  if (!user || rows.length === 0) return null;
  const line = (row: CustomerAddress) =>
    row.delivery
      ? formatDeliveryAddress(row.delivery as DeliveryAddress)
      : [row.shipping.address, row.shipping.ward, row.shipping.district, row.shipping.city].filter(Boolean).join(', ');
  return (
    <fieldset className="saved-address-cards">
      <legend>{t('title')}</legend>
      <div role="radiogroup" aria-label={t('title')}>
        {rows.map((row) => (
          <label key={row.id} className={`saved-address-card${selected === row.id ? ' is-selected' : ''}`}>
            <input type="radio" name="saved-address" checked={selected === row.id} onChange={() => onSelect(row)} />
            <span>
              <strong>
                {row.shipping.recipientName || row.label}
                {row.shipping.phone ? ` · ${row.shipping.phone}` : ''}
              </strong>
              <small>{line(row)}</small>
              {!row.delivery && <small className="text-warning">{t('needsAreas')}</small>}
            </span>
          </label>
        ))}
        <label className={`saved-address-card is-new${selected === -1 ? ' is-selected' : ''}`}>
          <input type="radio" name="saved-address" checked={selected === -1} onChange={onNew} />
          <span>
            <strong>{t('new')}</strong>
            <small>{t('newHint')}</small>
          </span>
        </label>
      </div>
      <Link className="store-text-link" href="/account/addresses">
        {t('manage')}
      </Link>
    </fieldset>
  );
}
