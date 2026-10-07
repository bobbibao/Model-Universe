'use client';
import { useEffect } from 'react';
// Keep manual storefront screens in sync with actions performed in the persistent assistant.
export default function useCustomerActionRefresh(kinds: string, refresh: () => void) {
  useEffect(() => {
    const accepted = kinds.split(',');
    const listener = (event: Event) => {
      if (accepted.includes((event as CustomEvent).detail?.kind)) refresh();
    };
    window.addEventListener('store:customer-action', listener);
    return () => window.removeEventListener('store:customer-action', listener);
  }, [kinds, refresh]);
}
