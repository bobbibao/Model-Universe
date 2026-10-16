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
import { MIN_DEPOSIT_PERCENT, type PaymentPlan } from '@/shared/payment';
import type { FulfillmentMethod, MeetingSlot } from '@/shared/fulfillment';

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
  useMemberDiscount: boolean;
  setUseMemberDiscount: Dispatch<SetStateAction<boolean>>;
  shipping: ShippingInfo;
  setShipping: Dispatch<SetStateAction<ShippingInfo>>;
  coupon: CouponPreview | null;
  setCoupon: Dispatch<SetStateAction<CouponPreview | null>>;
  // Upfront payment (src/shared/payment.ts): full transfer or a deposit percentage of the total (at least 10).
  paymentPlan: PaymentPlan;
  setPaymentPlan: Dispatch<SetStateAction<PaymentPlan>>;
  depositPercent: number;
  setDepositPercent: Dispatch<SetStateAction<number>>;
  // Delivery (src/shared/fulfillment.ts): SPX with the balance as COD, or an in-person handover.
  fulfillmentMethod: FulfillmentMethod;
  setFulfillmentMethod: Dispatch<SetStateAction<FulfillmentMethod>>;
  meeting: { date: string; slot: MeetingSlot };
  setMeeting: Dispatch<SetStateAction<{ date: string; slot: MeetingSlot }>>;
  shippingFeeOnDelivery: boolean;
  setShippingFeeOnDelivery: Dispatch<SetStateAction<boolean>>;
};
const Context = createContext<Draft | null>(null);
export function CheckoutDraftProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useCurrentUser();
  const previous = useRef<number | null | undefined>(undefined);
  const [shipping, setShipping] = useState<ShippingInfo>(EMPTY_SHIPPING);
  const [useMemberDiscount, setUseMemberDiscount] = useState(false);
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>('deposit');
  const [depositPercent, setDepositPercent] = useState<number>(MIN_DEPOSIT_PERCENT);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('SPX_COD');
  const [meeting, setMeeting] = useState<{ date: string; slot: MeetingSlot }>({ date: '', slot: '09-12' });
  const [shippingFeeOnDelivery, setShippingFeeOnDelivery] = useState(true);
  useEffect(() => {
    if (loading || previous.current === (user?.id ?? null)) return;
    previous.current = user?.id ?? null;
    setCoupon(null);
    setUseMemberDiscount(false);
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
        useMemberDiscount,
        setUseMemberDiscount,
        paymentPlan,
        setPaymentPlan,
        depositPercent,
        setDepositPercent,
        fulfillmentMethod,
        setFulfillmentMethod,
        meeting,
        setMeeting,
        shippingFeeOnDelivery,
        setShippingFeeOnDelivery,
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
