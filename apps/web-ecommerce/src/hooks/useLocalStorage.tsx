'use client';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  // Restore after hydration, then persist. Writing the initial value first would erase a saved cart.
  const initial = useRef(initialValue);
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [loadedKey, setLoadedKey] = useState<string>();
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      setStoredValue(saved ? JSON.parse(saved) : initial.current);
    } catch {
      setStoredValue(initial.current);
    }
    setLoadedKey(key);
  }, [key]);
  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      /* Storage may be disabled. */
    }
  }, [key, loadedKey, storedValue]);
  return [storedValue, setStoredValue];
}
export default useLocalStorage;
