'use client';

import { useTranslations } from 'next-intl';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import useLocalStorage from '@/hooks/useLocalStorage';
import CartApi from '@/core/client/api/Cart';
import type { CartItem, CartLine, CartQuote } from '@/shared/types/cart';

const CART_STORAGE_KEY = 'cart';
const QUOTE_DEBOUNCE_MS = 250;

export type CartProduct = {
  id: number;
  name: string;
  imageUrl: string;
  price: number;
  // Price after a running discount, when the caller knows it (display snapshot only; the quote is authoritative).
  salePrice?: number;
  brandName: string;
  stock: number;
};

// A cart item with its server-side check (undefined until the first quote arrives).
export type CartEntry = { item: CartItem; line?: CartLine };

interface CartContextValue {
  entries: CartEntry[];
  count: number;
  subtotal: number;
  hasIssues: boolean;
  quoting: boolean;
  addItem: (product: CartProduct, size: string, quantity: number) => boolean;
  updateQuantity: (productId: number, size: string, quantity: number) => void;
  removeItem: (productId: number, size: string) => void;
  removeUnavailable: () => void;
  clearCart: () => void;
  refreshQuote: () => Promise<CartQuote | undefined>;
}

const CartContext = createContext<CartContextValue | null>(null);

const lineKey = (productId: number, size: string) => `${productId}::${size}`;

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useTranslations('checkout');
  const [storedItems, setStoredItems] = useLocalStorage<CartItem[]>(CART_STORAGE_KEY, []);
  const items = useMemo(() => (Array.isArray(storedItems) ? storedItems : []), [storedItems]);
  // Multiple assistant action cards can resolve their product lookups in the same render.
  // Keep each mutation based on the latest cart instead of an older render's snapshot.
  const latestItems = useRef(items);
  latestItems.current = items;
  const saveItems = (next: CartItem[]) => {
    latestItems.current = next;
    setStoredItems(next);
  };
  const [quote, setQuote] = useState<CartQuote>();
  const [quoting, setQuoting] = useState(false);
  const requestId = useRef(0);

  const refreshQuote = useCallback(async () => {
    const current = ++requestId.current;
    if (items.length === 0) {
      setQuote({ lines: [], subtotal: 0, itemCount: 0, hasIssues: false });
      return undefined;
    }
    setQuoting(true);
    const result = await CartApi.getQuote(
      items.map(({ productId, size, quantity }) => ({ productId, size, quantity })),
    );
    // Ignore answers to outdated requests.
    if (current !== requestId.current) return result;
    if (result) setQuote(result);
    setQuoting(false);
    return result;
  }, [items]);

  useEffect(() => {
    const timer = setTimeout(refreshQuote, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [refreshQuote]);

  const entries = useMemo(() => {
    const lines = new Map((quote?.lines || []).map((line) => [lineKey(line.productId, line.size), line]));
    return items.map((item) => ({ item, line: lines.get(lineKey(item.productId, item.size)) }));
  }, [items, quote]);

  const addItem = (product: CartProduct, size: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return false;
    const items = latestItems.current;
    // Stock is per product, so all sizes already in the cart count.
    const inCart = items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
    if (inCart + quantity > product.stock) {
      toast.error(
        product.stock > inCart
          ? t('addMaximum',{count:product.stock-inCart})
          : t('stockLimit'),
      );
      return false;
    }
    const existing = items.find((item) => item.productId === product.id && item.size === size);
    const snapshot = {
      name: product.name,
      imageUrl: product.imageUrl,
      price: product.salePrice ?? product.price,
      brandName: product.brandName,
    };
    saveItems(
      existing
        ? items.map((item) => (item === existing ? { ...item, ...snapshot, quantity: item.quantity + quantity } : item))
        : [...items, { productId: product.id, size, quantity, ...snapshot }],
    );
    toast.success(t('addedToBag'));
    return true;
  };

  const updateQuantity = (productId: number, size: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    saveItems(
      latestItems.current.map((item) =>
        item.productId === productId && item.size === size ? { ...item, quantity } : item,
      ),
    );
  };

  const removeItem = (productId: number, size: string) =>
    saveItems(latestItems.current.filter((item) => !(item.productId === productId && item.size === size)));

  // Drops lines whose product was deleted, archived, sold out or whose size no longer exists.
  const removeUnavailable = () => {
    const unavailable = new Set(
      entries
        .filter(({ line }) => line && ['UNAVAILABLE', 'OUT_OF_STOCK', 'INVALID_SIZE'].includes(line.status))
        .map(({ item }) => lineKey(item.productId, item.size)),
    );
    saveItems(latestItems.current.filter((item) => !unavailable.has(lineKey(item.productId, item.size))));
  };

  const clearCart = () => saveItems([]);

  const value: CartContextValue = {
    entries,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: quote?.subtotal ?? items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    hasIssues: !!quote?.hasIssues,
    quoting,
    addItem,
    updateQuantity,
    removeItem,
    removeUnavailable,
    clearCart,
    refreshQuote,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
};
