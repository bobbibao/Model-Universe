'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';
import Link from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { CustomerAddress } from '@/shared/types/customer-tools';
import type { ShippingInfo } from '@/shared/types/order';

export default function SavedAddressSelector({ onSelect }: { onSelect: (shipping: ShippingInfo) => void }) {
  const t = useTranslations('customerTools'), { user } = useCurrentUser();
  const [rows, setRows] = useState<CustomerAddress[]>([]);
  useEffect(() => {
    let active = true; setRows([]);
    if (user) void Api.get('/addresses').then((response: { data: CustomerAddress[] }) => { if (active) setRows(response.data); }).catch(() => { /* Manual entry remains available. */ });
    return () => { active = false; };
  }, [user]);
  if (!user) return null;
  return <div className="mb-5 flex flex-wrap items-end gap-3">
    {rows.length > 0 && <label className="mu-field min-w-0 flex-1">{t('savedAddress')}<select defaultValue="" onChange={event => {
      const row = rows.find(item => item.id === Number(event.target.value));
      if (row) onSelect(Object.fromEntries(Object.entries(row.shipping).map(([key, value]) => [key, value || ''])) as unknown as ShippingInfo);
      event.target.value = '';
    }}><option value="" disabled>{t('chooseAddress')}</option>{rows.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>}
    <Link className="underline" href="/account/addresses">{t('manageAddresses')}</Link>
  </div>;
}
