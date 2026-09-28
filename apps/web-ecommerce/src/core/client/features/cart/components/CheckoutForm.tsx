'use client';

import TextField from '@/components/FormElements/TextField';
import type { ShippingInfo } from '@/shared/types/order';

export type ShippingErrors = Partial<Record<keyof ShippingInfo, string>>;

const PHONE_PATTERN = /^\+?[0-9\s.-]{8,15}$/;

export const validateShipping = (shipping: ShippingInfo): ShippingErrors => {
  const errors: ShippingErrors = {};
  if (!shipping.recipientName.trim()) errors.recipientName = 'Vui lòng nhập tên người nhận.';
  if (!PHONE_PATTERN.test(shipping.phone.trim())) errors.phone = 'Số điện thoại không hợp lệ.';
  if (shipping.address.trim().length < 4) errors.address = 'Địa chỉ phải có ít nhất 4 ký tự.';
  if (!shipping.city.trim()) errors.city = 'Vui lòng nhập tỉnh/thành phố.';
  return errors;
};

interface CheckoutFormProps {
  shipping: ShippingInfo;
  errors: ShippingErrors;
  onChange: (shipping: ShippingInfo) => void;
}

// Shipping details for the order (pre-filled from the customer profile).
const CheckoutForm = ({ shipping, errors, onChange }: CheckoutFormProps) => {
  const field = (key: keyof ShippingInfo) => ({
    name: key,
    value: shipping[key],
    error: errors[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...shipping, [key]: event.target.value }),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField label="Họ tên người nhận" autoComplete="name" {...field('recipientName')} />
      <TextField label="Số điện thoại" type="tel" autoComplete="tel" {...field('phone')} />
      <TextField label="Địa chỉ" autoComplete="street-address" className="sm:col-span-2" {...field('address')} />
      <TextField label="Phường/Xã" {...field('ward')} />
      <TextField label="Quận/Huyện" {...field('district')} />
      <TextField label="Tỉnh/Thành phố" className="sm:col-span-2" {...field('city')} />
      <TextField
        label="Ghi chú cho đơn hàng"
        placeholder="Không bắt buộc"
        className="sm:col-span-2"
        {...field('note')}
      />
    </div>
  );
};

export default CheckoutForm;
