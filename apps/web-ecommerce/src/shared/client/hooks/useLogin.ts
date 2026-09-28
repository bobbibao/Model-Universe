'use client';

import AuthApi from '@/core/client/api/Auth';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { User } from '@/shared/types/user';

export const useLogin = () => {
  const { setUser } = useCurrentUser();

  const login = async (email: string, password: string): Promise<User | undefined> => {
    const user = await AuthApi.login(email, password);
    if (user) {
      setUser(user);
    }
    return user;
  };

  return { login };
};
