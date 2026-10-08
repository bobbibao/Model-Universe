'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { CustomerAddress } from '@/shared/types/customer-tools';
import type { ShippingInfo } from '@/shared/types/order';
import CheckoutForm, { validateShipping, type ShippingErrors } from '../../cart/components/CheckoutForm';

const empty: ShippingInfo = { recipientName: '', phone: '', address: '', ward: '', district: '', city: '', note: '' };
export default function AddressBook() {
  const t = useTranslations('customerTools'), common = useTranslations('common'), { user } = useCurrentUser();
  const [rows, setRows] = useState<CustomerAddress[]>([]), [selected, setSelected] = useState<CustomerAddress | null>(null);
  const [shipping, setShipping] = useState(empty), [label, setLabel] = useState(''), [errors, setErrors] = useState<ShippingErrors>({});
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false);
  const pending = useRef<{ digest: string; key: string }>();
  const load = useCallback(async () => {
    if (!user) return;
    try { setRows((await Api.get('/addresses')).data); setFailed(false); setLoaded(true); } catch { setFailed(true); }
  }, [user]);
  useEffect(() => { setRows([]); setLoaded(false); void load(); }, [load]);
  const reset = () => { setSelected(null); setShipping(empty); setLabel(''); setErrors({}); pending.current = undefined; };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const validation = validateShipping(shipping); setErrors(validation);
    if (Object.keys(validation).length) return;
    const body = { label, shipping }, digest = JSON.stringify(body);
    if (pending.current?.digest !== digest) pending.current = { digest, key: crypto.randomUUID() };
    setBusy(true);
    try { await Api.post('/addresses', { ...body, ...(selected ? { id: selected.id, expectedVersion: selected.version } : { requestKey: pending.current.key }) }); await load(); reset(); }
    catch { /* Keep the exact create reference and form after uncertain responses. */ }
    finally { setBusy(false); }
  };
  if (!user) return <section className="mu-wrap mu-section"><h1 className="mu-heading">{t('addresses')}</h1><Link className="mu-button mt-6" href="/auth/signin?redirect=%2Faccount%2Faddresses">{common('signIn')}</Link></section>;
  return <section className="mu-wrap mu-section">
    <p className="mu-eyebrow">MODEL UNIVERSE / ACCOUNT</p><h1 className="mu-heading">{t('addresses')}</h1><p className="mu-note mt-4">{t('addressNote')}</p>
    {failed && <button className="mu-button mt-4" onClick={() => void load()}>{common('retry')}</button>}
    {!loaded && !failed && <p role="status" className="mu-note mt-4">{common('loading')}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">{loaded && rows.length === 0 && <p className="mu-note">{t('noAddresses')}</p>}{rows.map(row => <article className="mu-panel space-y-3 p-5" key={row.id}>
        <h2 className="break-words text-xl font-bold tracking-tight">{row.label}</h2><p>{row.shipping.recipientName} · {row.shipping.phone}</p><p className="mu-note break-words">{[row.shipping.address, row.shipping.ward, row.shipping.district, row.shipping.city].filter(Boolean).join(', ')}</p>
        <div className="flex gap-4"><button className="underline" disabled={busy} onClick={() => { setSelected(row); setLabel(row.label); setShipping(Object.fromEntries(Object.entries(row.shipping).map(([key, value]) => [key, value || ''])) as unknown as ShippingInfo); setErrors({}); }}>{t('editAddress')}</button>
          <button className="underline" disabled={busy} onClick={async () => { setBusy(true); try { await Api.post(`/addresses/${row.id}/remove`, { expectedVersion: row.version }); if (selected?.id === row.id) reset(); await load(); } catch { /* Retain the list until removal is confirmed. */ } finally { setBusy(false); } }}>{common('remove')}</button></div>
      </article>)}</div>
      {loaded && <form className="mu-panel space-y-5 p-6" aria-label={t('addressForm')} onSubmit={event => void save(event)}>
        <h2 className="text-2xl font-bold tracking-tight">{selected ? t('editAddress') : t('addAddress')}</h2>
        <label className="mu-field">{t('addressLabel')}<input value={label} onChange={event => setLabel(event.target.value)} required maxLength={80} /></label>
        <CheckoutForm shipping={shipping} errors={errors} onChange={setShipping} showSavedAddresses={false} />
        <div className="flex flex-wrap gap-3"><button className="mu-button" disabled={busy || (!selected && rows.length >= 20)}>{common('submit')}</button>{selected && <button type="button" className="mu-button-secondary" disabled={busy} onClick={reset}>{common('cancel')}</button>}</div>
      </form>}
    </div>
  </section>;
}
