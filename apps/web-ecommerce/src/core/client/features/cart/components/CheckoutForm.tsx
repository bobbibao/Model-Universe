'use client';

import TextField from '@/components/FormElements/TextField';
import { useTranslations } from 'next-intl';
import type { ShippingInfo } from '@/shared/types/order';

export type ShippingErrors = Partial<Record<keyof ShippingInfo, string>>;

const PHONE_PATTERN = /^\+?[0-9\s.-]{8,15}$/;

export const validateShipping = (shipping: ShippingInfo): ShippingErrors => {
  const errors: ShippingErrors = {};
  if (!shipping.recipientName.trim()) errors.recipientName = 'recipientRequired';
  if (!PHONE_PATTERN.test(shipping.phone.trim())) errors.phone = 'phoneInvalid';
  if (shipping.address.trim().length < 4) errors.address = 'addressInvalid';
  if (!shipping.city.trim()) errors.city = 'cityRequired';
  return errors;
};

interface CheckoutFormProps {
  shipping: ShippingInfo;
  errors: ShippingErrors;
  onChange: (shipping: ShippingInfo) => void;
}

// Shipping details for the order (pre-filled from the customer profile).
const CheckoutForm = ({ shipping, errors, onChange }: CheckoutFormProps) => {
  const t = useTranslations('checkout');
  const field = (key: keyof ShippingInfo) => ({
    name: key,
    value: shipping[key],
    error: errors[key] ? t(`validation.${errors[key]}`) : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...shipping, [key]: event.target.value }),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField label={t('recipientName')} autoComplete="name" {...field('recipientName')} />
      <TextField label={t('phone')} type="tel" autoComplete="tel" {...field('phone')} />
      <TextField label={t('address')} autoComplete="street-address" className="sm:col-span-2" {...field('address')} />
      <TextField label={t('ward')} {...field('ward')} />
      <TextField label={t('district')} {...field('district')} />
      <TextField label={t('city')} className="sm:col-span-2" {...field('city')} />
      <TextField
        label={t('note')}
        placeholder={t('optional')}
        className="sm:col-span-2"
        {...field('note')}
      />
    </div>
  );
};

export default CheckoutForm;
