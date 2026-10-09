'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Api from '@/core/client/api/Api';

interface Policy { id: number; name: string; version: number; settings: Record<string,string | number>; reason: string; createdAt: string; }
const POLICY_NAMES = ['reservation','loyalty','pawn','marketplace','buyback'];
const CHOICES: Record<string,{ key: string; options?: string[]; number?: boolean }[]> = {
  reservation:[{key:'priceBasis',options:['net_merchandise']},{key:'dayCutoff',options:['elapsed_24h']},{key:'extensionMode',options:['additive']}],
  loyalty:[{key:'rewardTable',options:['source_shared_v1']},{key:'stacking',options:['one_primary']},{key:'refundRounding',options:['cumulative_net']},{key:'lifetimeRefund',options:['reverse_earned']},{key:'voucherExpiryDays',number:true}],
  pawn:[{key:'dailyRateBasisPoints',options:['3','30']},{key:'dayCount',options:['started_days','completed_days']},{key:'rounding',options:['ceil','floor','nearest']},{key:'graceDays',number:true},{key:'interestStopEvent',options:['verified_repayment','asset_handback']}],
  marketplace:[{key:'commissionBasisPoints',options:['500','600','700','800','1000','1200']},{key:'guaranteeBasisPoints',options:['1000']},{key:'guaranteeRounding',options:['ceil','floor','nearest']},{key:'settlementDelayDays',number:true},{key:'shippingAllocation',options:['per_seller_quote']}],
  buyback:[{key:'inboundCod',options:['not_supported']}],
};

export default function CommercePolicyWorkspace() {
  const t = useTranslations('policy'), locale = useLocale();
  const [rows,setRows] = useState<Policy[]>([]), [name,setName] = useState('reservation'), [busy,setBusy] = useState(false), [failed,setFailed] = useState(false);
  const load = useCallback(async () => {
    try { setRows((await Api.get('/admin/commerce/policies')).data); setFailed(false); }
    catch { setFailed(true); }
  },[]);
  useEffect(() => { void load(); },[load]);
  const current = rows.find(row => row.name === name);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const settings = Object.fromEntries(CHOICES[name].map(field => {
      const value = data.get(field.key);
      return [field.key, field.number || field.key.endsWith('BasisPoints') ? Number(value) : value];
    }));
    setBusy(true);
    try { await Api.post(`/admin/commerce/policies/${name}/approve`,{ settings,version:current?.version || 0,reason:data.get('reason'),confirmApproval:data.get('confirmApproval') === 'on' }); await load(); form.reset(); }
    catch { /* The shared API reports validation and concurrent approvals. */ }
    finally { setBusy(false); }
  };
  return <section className="mu-wrap py-8"><p className="mu-eyebrow">MODEL UNIVERSE / OPERATIONS</p><h1 className="mu-heading">{t('title')}</h1><p className="mu-note max-w-3xl">{t('intro')}</p>
    {failed ? <button className="mu-button mt-5" onClick={() => void load()}>{t('retry')}</button> : <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="mu-panel space-y-5 p-6"><label className="mu-field">{t('domain')}<select value={name} onChange={event => setName(event.target.value)}>{POLICY_NAMES.map(value => <option key={value} value={value}>{t(`names.${value}`)}</option>)}</select></label>
        <p className="mu-note">{t('currentVersion',{version:current?.version || 0})}</p><p>{t(`disclosures.${name}`)}</p>
        <form key={name} onSubmit={event => void submit(event)} className="space-y-4">
          {CHOICES[name].map(field => <label key={field.key} className="mu-field">{t(`fields.${field.key}`)}{field.options ? <select name={field.key} required defaultValue=""><option value="" disabled>{t('choose')}</option>{field.options.map(value => <option key={value} value={value}>{field.key.endsWith('BasisPoints') ? `${Number(value) / 100}%` : t(`values.${value}`)}</option>)}</select> : <input name={field.key} type="number" min={field.key === 'voucherExpiryDays' ? 1 : 0} step="1" required />}</label>)}
          <label className="mu-field">{t('reason')}<textarea name="reason" required maxLength={1000} /></label>
          <label className="flex gap-3"><input type="checkbox" name="confirmApproval" required />{t('confirmation')}</label>
          <button className="mu-button" disabled={busy}>{t('approve')}</button>
        </form>
      </div>
      <div className="space-y-3"><h2 className="mu-heading text-2xl">{t('history')}</h2>{rows.filter(row => row.name === name).map(row => <article key={row.id} className="mu-panel p-5"><h3 className="font-bold">{t('version',{version:row.version})}</h3><p className="mu-note">{new Date(row.createdAt).toLocaleString(locale)}</p><dl className="mt-3 space-y-2">{Object.entries(row.settings).map(([key,value]) => <div key={key}><dt className="text-sm font-bold">{t(`fields.${key}`)}</dt><dd className="mu-note">{key.endsWith('BasisPoints') ? `${Number(value) / 100}%` : typeof value === 'number' ? value : t(`values.${value}`)}</dd></div>)}</dl><p className="mu-note">{row.reason}</p></article>)}{!current && <p className="mu-note">{t('inactive')}</p>}</div>
    </div>}
  </section>;
}
