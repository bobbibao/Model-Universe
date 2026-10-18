'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { CustomerAddress } from '@/shared/types/customer-tools';
import type { ShippingInfo } from '@/shared/types/order';
import CheckoutForm, { validateShipping, type ShippingErrors } from '../../cart/components/CheckoutForm';
import AddressPicker, { type AddressDraft } from '@/components/Address/AddressPicker';
import { formatDeliveryAddress } from '@/shared/fulfillment';

const empty: ShippingInfo = { recipientName: '', phone: '', address: '', ward: '', district: '', city: '', note: '' };
// Saved addresses use the checkout address picker (SuperAI areas), so a saved address is ready for courier delivery.
const complete = (address: AddressDraft) =>
  !!address.provinceCode && !!address.districtCode && !!address.communeCode && (address.street || '').trim().length >= 4;
const draftOf = (row: CustomerAddress): AddressDraft =>
  row.delivery ?? { street: row.shipping.address, communeName: row.shipping.ward || undefined, districtName: row.shipping.district || undefined, provinceName: row.shipping.city };
export default function AddressBook({ embedded = false }: { embedded?: boolean } = {}) {
  const Heading = embedded ? 'h2' : 'h1';
  const t = useTranslations('customerTools'), common = useTranslations('common'), { user } = useCurrentUser();
  const [rows, setRows] = useState<CustomerAddress[]>([]), [selected, setSelected] = useState<CustomerAddress | null>(null);
  const [shipping, setShipping] = useState(empty), [label, setLabel] = useState(''), [errors, setErrors] = useState<ShippingErrors>({});
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false);
  const [delivery, setDelivery] = useState<AddressDraft>({}), [addressError, setAddressError] = useState(false);
  const pending = useRef<{ digest: string; key: string } | undefined>(undefined);
  const load = useCallback(async () => {
    if (!user) return;
    try { setRows((await Api.get('/addresses')).data); setFailed(false); setLoaded(true); } catch { setFailed(true); }
  }, [user]);
  useEffect(() => { setRows([]); setLoaded(false); void load(); }, [load]);
  const reset = () => { setSelected(null); setShipping(empty); setDelivery({}); setLabel(''); setErrors({}); setAddressError(false); pending.current = undefined; };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lines = { ...shipping, address: delivery.street || '', ward: delivery.communeName || '', district: delivery.districtName || '', city: delivery.provinceName || '' };
    const validation = validateShipping(lines); setErrors(validation); setAddressError(!complete(delivery));
    if (Object.keys(validation).length || !complete(delivery)) return;
    const body = { label: label || formatDeliveryAddress(delivery).slice(0, 80), shipping: lines, delivery }, digest = JSON.stringify(body);
    if (pending.current?.digest !== digest) pending.current = { digest, key: crypto.randomUUID() };
    setBusy(true);
    try { await Api.post('/addresses', { ...body, ...(selected ? { id: selected.id, expectedVersion: selected.version } : { requestKey: pending.current.key }) }); await load(); reset(); }
    catch { /* Keep the exact create reference and form after uncertain responses. */ }
    finally { setBusy(false); }
  };
  if (!user) return <section className="mu-wrap mu-section"><Heading className="mu-heading">{t('addresses')}</Heading><Link className="mu-button mt-6" href="/auth/signin?redirect=%2Faccount%2Faddresses">{common('signIn')}</Link></section>;
  return <section className="mu-wrap mu-section">
    <p className="mu-eyebrow">MODEL UNIVERSE / ACCOUNT</p><Heading className="mu-heading">{t('addresses')}</Heading><p className="mu-note mt-4">{t('addressNote')}</p>
    {failed && <button className="mu-button mt-4" onClick={() => void load()}>{common('retry')}</button>}
    {!loaded && !failed && <p role="status" className="mu-note mt-4">{common('loading')}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">{loaded && rows.length === 0 && <p className="mu-note">{t('noAddresses')}</p>}{rows.map(row => <article className="mu-panel space-y-3 p-5" key={row.id}>
        <h2 className="break-words text-xl font-bold tracking-tight">{row.label}</h2><p>{row.shipping.recipientName} · {row.shipping.phone}</p><p className="mu-note break-words">{row.delivery ? formatDeliveryAddress(row.delivery) : [row.shipping.address, row.shipping.ward, row.shipping.district, row.shipping.city].filter(Boolean).join(', ')}</p>
        <div className="flex gap-4"><button className="underline" disabled={busy} onClick={() => { setSelected(row); setLabel(row.label); setShipping(Object.fromEntries(Object.entries(row.shipping).map(([key, value]) => [key, value || ''])) as unknown as ShippingInfo); setDelivery(draftOf(row)); setErrors({}); }}>{t('editAddress')}</button>
          <button className="underline" disabled={busy} onClick={async () => { setBusy(true); try { await Api.post(`/addresses/${row.id}/remove`, { expectedVersion: row.version }); if (selected?.id === row.id) reset(); await load(); } catch { /* Retain the list until removal is confirmed. */ } finally { setBusy(false); } }}>{common('remove')}</button></div>
      </article>)}</div>
      {loaded && <form className="mu-panel space-y-5 p-6" aria-label={t('addressForm')} onSubmit={event => void save(event)}>
        <h2 className="text-2xl font-bold tracking-tight">{selected ? t('editAddress') : t('addAddress')}</h2>
        <label className="mu-field">{t('addressLabel')}<input value={label} onChange={event => setLabel(event.target.value)} maxLength={80} placeholder={t('addressLabelHint')} /></label>
        <CheckoutForm shipping={shipping} errors={errors} onChange={setShipping} showSavedAddresses={false} contactOnly />
        <AddressPicker value={delivery} onChange={setDelivery} idPrefix="address-book" />
        {addressError && <p role="alert" className="text-sm text-danger">{t('addressIncomplete')}</p>}
        <div className="flex flex-wrap gap-3"><button className="mu-button" disabled={busy || (!selected && rows.length >= 20)}>{common('submit')}</button>{selected && <button type="button" className="mu-button-secondary" disabled={busy} onClick={reset}>{common('cancel')}</button>}</div>
      </form>}
    </div>
  </section>;
}
