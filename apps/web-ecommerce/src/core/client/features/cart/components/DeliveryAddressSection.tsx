'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import TextField from '@/components/FormElements/TextField';
import AdminIcon from '@/components/Admin/AdminIcon';
import AddressPicker, { type AddressDraft } from '@/components/Address/AddressPicker';
import { formatDeliveryAddress, plainPhone } from '@/shared/fulfillment';
import type { CustomerAddress } from '@/shared/types/customer-tools';
import type { ShippingInfo } from '@/shared/types/order';
import type { ShippingErrors } from './CheckoutForm';

const NEW = -1;
const line = (row: CustomerAddress) =>
  row.delivery
    ? formatDeliveryAddress(row.delivery)
    : [row.shipping.address, row.shipping.ward, row.shipping.district, row.shipping.city].filter(Boolean).join(', ');
// The saved row the draft already points at (the same commune, street, recipient and phone), if any.
const sameAs = (row: CustomerAddress, shipping: ShippingInfo, address: AddressDraft) =>
  !!row.delivery &&
  row.delivery.communeCode === address.communeCode &&
  row.delivery.street.trim().toLowerCase() === (address.street || '').trim().toLowerCase() &&
  plainPhone(row.shipping.phone) === plainPhone(shipping.phone);

// Courier delivery address at checkout, the way marketplaces show it: the chosen saved address as one card with
// "Change" (the address book as a short list, plus "Add a new address"), or the new-address form (recipient, phone,
// SuperAI areas, street, an optional map pin). The most recent saved address is preselected; a new address joins the
// book after payment (the server keeps one row per recipient, phone and place).
export default function DeliveryAddressSection({
  shipping,
  errors,
  onShippingChange,
  address,
  onAddressChange,
  children,
}: {
  shipping: ShippingInfo;
  errors: ShippingErrors;
  onShippingChange: (shipping: ShippingInfo) => void;
  address: AddressDraft;
  onAddressChange: (address: AddressDraft) => void;
  // Shown under the address (the carrier and fee for it), above the message for the shop.
  children?: React.ReactNode;
}) {
  const t = useTranslations('checkout'),
    saved = useTranslations('checkout.savedAddresses');
  const [rows, setRows] = useState<CustomerAddress[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    let active = true;
    void Api.get('/addresses')
      .then((response: { data: CustomerAddress[] }) => active && setRows(response.data))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, []);

  const apply = (row: CustomerAddress) => {
    setSelectedId(row.id);
    setChoosing(false);
    onShippingChange({
      ...shipping,
      recipientName: row.shipping.recipientName || shipping.recipientName,
      phone: row.shipping.phone || shipping.phone,
    });
    // An older address (text only) is matched to SuperAI's areas by name in the address picker.
    onAddressChange(
      row.delivery ?? {
        street: row.shipping.address,
        communeName: row.shipping.ward || undefined,
        districtName: row.shipping.district || undefined,
        provinceName: row.shipping.city,
      },
    );
  };
  const addNew = () => {
    setSelectedId(NEW);
    setChoosing(false);
    onAddressChange({});
  };

  // Once the book is loaded: keep the address the draft already has (selecting its saved row when there is one), or
  // preselect the most recent saved address.
  useEffect(() => {
    if (!rows || selectedId !== null) return;
    const current = rows.find((row) => sameAs(row, shipping, address));
    if (current) setSelectedId(current.id);
    else if (address.communeCode || address.street) setSelectedId(NEW);
    else if (rows[0]) apply(rows[0]);
    else setSelectedId(NEW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (!rows) return <p className="delivery-address-loading">{saved('loading')}</p>;

  const selected = rows.find((row) => row.id === selectedId);
  // A saved address is shown as a card unless it needs fixing (older text-only address, or invalid contact details).
  const editing = !selected || !selected.delivery || !!errors.recipientName || !!errors.phone;
  const contact = (key: 'recipientName' | 'phone') => ({
    name: key,
    value: shipping[key],
    error: errors[key] ? t(`validation.${errors[key]}`) : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onShippingChange({ ...shipping, [key]: event.target.value }),
  });

  if (choosing)
    return (
      <div className="delivery-address-list">
        <div className="delivery-address-list-head">
          <strong>{saved('choose')}</strong>
          <Link className="store-text-link" href="/account/addresses">
            {saved('manage')}
          </Link>
        </div>
        <div role="radiogroup" aria-label={saved('choose')}>
          {rows.map((row, index) => (
            <label key={row.id} className={`delivery-address-option${row.id === selectedId ? ' is-selected' : ''}`}>
              <input type="radio" name="saved-address" checked={row.id === selectedId} onChange={() => apply(row)} />
              <span>
                <strong>
                  {row.shipping.recipientName || row.label}
                  {row.shipping.phone && <em>{row.shipping.phone}</em>}
                  {index === 0 && <i>{saved('latest')}</i>}
                </strong>
                <small>{line(row)}</small>
                {!row.delivery && <small className="text-warning">{saved('needsAreas')}</small>}
              </span>
            </label>
          ))}
        </div>
        <button type="button" className="delivery-address-add" onClick={addNew}>
          <AdminIcon name="plus" size={16} />
          {saved('add')}
        </button>
      </div>
    );

  return (
    <div className="delivery-address">
      {!editing && selected ? (
        <div className="delivery-address-card">
          <span className="delivery-address-icon">
            <AdminIcon name="pin" size={18} />
          </span>
          <span className="delivery-address-text">
            <strong>
              {shipping.recipientName}
              <em>{shipping.phone}</em>
            </strong>
            <small>{line(selected)}</small>
          </span>
          <button type="button" className="delivery-address-change" onClick={() => setChoosing(true)}>
            {saved('change')}
          </button>
        </div>
      ) : (
        <div className="delivery-address-form">
          <div className="delivery-address-list-head">
            <strong>{selected ? line(selected) : saved('newTitle')}</strong>
            {rows.length > 0 && (
              <button type="button" className="store-text-link" onClick={() => setChoosing(true)}>
                {saved('useSaved')}
              </button>
            )}
          </div>
          {selected && !selected.delivery && <p className="mu-note text-sm text-warning">{saved('needsAreas')}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label={t('recipientName')} autoComplete="name" {...contact('recipientName')} />
            <TextField label={t('phone')} type="tel" autoComplete="tel" {...contact('phone')} />
          </div>
          <AddressPicker value={address} onChange={onAddressChange} idPrefix="checkout-address" compact />
          {!selected && <p className="payment-plan-note">{saved('newHint')}</p>}
        </div>
      )}
      {children}
      <TextField
        label={t('messageToShop')}
        placeholder={t('messagePlaceholder')}
        name="note"
        value={shipping.note}
        maxLength={300}
        onChange={(event) => onShippingChange({ ...shipping, note: event.target.value })}
      />
    </div>
  );
}
