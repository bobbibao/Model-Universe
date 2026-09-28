'use client';

import { useRouter } from 'next/navigation';
import AuthApi from '@/core/client/api/Auth';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';

export const useLogout = () => {
  const router = useRouter();
  const { setUser } = useCurrentUser();

  const logout = async () => {
    await AuthApi.logout();
    setUser(null);
    router.push('/');
    router.refresh();
  };

  return { logout };
};
