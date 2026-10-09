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
  useMemberDiscount:boolean;
  setUseMemberDiscount:Dispatch<SetStateAction<boolean>>;
  shipping: ShippingInfo;
  setShipping: Dispatch<SetStateAction<ShippingInfo>>;
  coupon: CouponPreview | null;
  setCoupon: Dispatch<SetStateAction<CouponPreview | null>>;
};
const Context = createContext<Draft | null>(null);
export function CheckoutDraftProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useCurrentUser();
  const previous = useRef<number | null | undefined>(undefined);
  const [shipping, setShipping] = useState<ShippingInfo>(EMPTY_SHIPPING);
  const [useMemberDiscount,setUseMemberDiscount] = useState(false);
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
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
  return <Context.Provider value={{ shipping, setShipping, coupon, setCoupon, useMemberDiscount, setUseMemberDiscount }}>{children}</Context.Provider>;
}
export function useCheckoutDraft() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing CheckoutDraftProvider');
  return value;
}
