'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const KEY = 'model-universe.comparison.v1';
const valid = (value: unknown): number[] => Array.isArray(value) ? Array.from(new Set(value.filter(id => Number.isSafeInteger(id) && id > 0))).slice(0,3) : [];
const Context = createContext<{ ids:number[]; toggle:(id:number) => void; clear:() => void } | null>(null);

// Three public product IDs only. No prices, account identifiers, or private data are persisted.
export function ComparisonProvider({children}:{children:ReactNode}) {
  const [ids,setIds] = useState<number[]>([]), [ready,setReady] = useState(false);
  useEffect(() => {
    try { setIds(valid(JSON.parse(localStorage.getItem(KEY) || '[]'))); } catch { /* Malformed or disabled local storage starts empty. */ }
    setReady(true);
    const changed = (event: StorageEvent) => { if (event.key === KEY) { try { setIds(valid(JSON.parse(event.newValue || '[]'))); } catch { setIds([]); } } };
    window.addEventListener('storage',changed);
    return () => window.removeEventListener('storage',changed);
  },[]);
  useEffect(() => { if (ready) try { localStorage.setItem(KEY,JSON.stringify(ids)); } catch { /* Comparison still works in memory. */ } },[ids,ready]);
  return <Context.Provider value={{ids,toggle:id => {
    if (!Number.isSafeInteger(id) || id < 1) return;
    setIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 3 ? [...current,id] : current);
  },clear:() => setIds([])}}>{children}</Context.Provider>;
}
export function useComparison() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing ComparisonProvider');
  return value;
}
