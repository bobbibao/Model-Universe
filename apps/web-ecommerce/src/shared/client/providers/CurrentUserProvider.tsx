'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AuthApi from '@/core/client/api/Auth';
import type { User } from '@/shared/types/user';

interface CurrentUserContextValue {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
}

const CurrentUserContext = createContext<CurrentUserContextValue>({
  user: null,
  loading: true,
  setUser: () => undefined,
  refresh: async () => undefined,
});

export const CurrentUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await AuthApi.getCurrentUser());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CurrentUserContext.Provider value={{ user, loading, setUser, refresh }}>{children}</CurrentUserContext.Provider>
  );
};

export const useCurrentUser = () => {
  return useContext(CurrentUserContext);
};
