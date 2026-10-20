'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import { useCurrentUser } from './CurrentUserProvider';
import type { CouponPreview, ShippingInfo } from '@/shared/types/order';
import type { PaymentPlan } from '@/shared/payment';
import type { FulfillmentMethod, MeetingSlot } from '@/shared/fulfillment';
import type { AddressDraft } from '@/components/Address/AddressPicker';

export const EMPTY_SHIPPING: ShippingInfo = {
  recipientName: '',
  phone: '',
  address: '',
  ward: '',
  district: '',
  city: '',
  note: '',
};
type Draft = {
  // Stacked benefits (src/shared/promotions.ts): one discount code (`coupon`), one free-shipping code and points.
  freeship: CouponPreview | null;
  setFreeship: Dispatch<SetStateAction<CouponPreview | null>>;
  usePoints: boolean;
  setUsePoints: Dispatch<SetStateAction<boolean>>;
  shipping: ShippingInfo;
  setShipping: Dispatch<SetStateAction<ShippingInfo>>;
  coupon: CouponPreview | null;
  setCoupon: Dispatch<SetStateAction<CouponPreview | null>>;
  // Upfront payment (src/shared/payment.ts): the full amount or the deposit (10%, at least the shipping fee).
  paymentPlan: PaymentPlan;
  setPaymentPlan: Dispatch<SetStateAction<PaymentPlan>>;
  // Delivery (src/shared/fulfillment.ts): courier with the balance as COD, or an in-person handover.
  fulfillmentMethod: FulfillmentMethod;
  setFulfillmentMethod: Dispatch<SetStateAction<FulfillmentMethod>>;
  meeting: { date: string; slot: MeetingSlot };
  setMeeting: Dispatch<SetStateAction<{ date: string; slot: MeetingSlot }>>;
  // Courier delivery address (SuperAI areas: province → district → ward codes, street, map position).
  deliveryAddress: AddressDraft;
  setDeliveryAddress: Dispatch<SetStateAction<AddressDraft>>;
};
const Context = createContext<Draft | null>(null);
export function CheckoutDraftProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useCurrentUser();
  const previous = useRef<number | null | undefined>(undefined);
  const [shipping, setShipping] = useState<ShippingInfo>(EMPTY_SHIPPING);
  const [freeship, setFreeship] = useState<CouponPreview | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>('deposit');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('COURIER_COD');
  const [meeting, setMeeting] = useState<{ date: string; slot: MeetingSlot }>({ date: '', slot: '09-12' });
  const [deliveryAddress, setDeliveryAddress] = useState<AddressDraft>({});
  useEffect(() => {
    if (loading || previous.current === (user?.id ?? null)) return;
    previous.current = user?.id ?? null;
    setCoupon(null);
    setFreeship(null);
    setUsePoints(false);
    setShipping({
      ...EMPTY_SHIPPING,
      recipientName: user ? `${user.lastName} ${user.firstName}`.trim() : '',
      phone: user?.phone || '',
      address: user?.address || '',
    });
  }, [user, loading]);
  return (
    <Context.Provider
      value={{
        shipping,
        setShipping,
        coupon,
        setCoupon,
        freeship,
        setFreeship,
        usePoints,
        setUsePoints,
        paymentPlan,
        setPaymentPlan,
        fulfillmentMethod,
        setFulfillmentMethod,
        meeting,
        setMeeting,
        deliveryAddress,
        setDeliveryAddress,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCheckoutDraft() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing CheckoutDraftProvider');
  return value;
}
