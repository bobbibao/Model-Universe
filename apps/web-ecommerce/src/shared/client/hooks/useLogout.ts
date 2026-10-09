'use client';

import { useRouter } from '@/i18n/navigation';
import AuthApi from '@/core/client/api/Auth';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';

export const useLogout = () => {
  const router = useRouter();
  const { setUser } = useCurrentUser();

  const logout = async () => {
    if (!await AuthApi.logout()) return false;
    setUser(null);
    router.push('/');
    router.refresh();
    return true;
  };

  return { logout };
};
