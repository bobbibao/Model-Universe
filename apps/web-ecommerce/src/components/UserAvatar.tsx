import type { User } from '@/shared/types/user';

// Avatar image when the user has one, otherwise their initials.
const UserAvatar = ({ user, size = 40 }: { user: Pick<User, 'firstName' | 'lastName' | 'avatar'>; size?: number }) => {
  const initials = `${user.lastName?.[0] || ''}${user.firstName?.[0] || ''}`.toUpperCase();
  return user.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatar} alt="" width={size} height={size} className="rounded-full object-cover" />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink"
    >
      {initials || '?'}
    </span>
  );
};

export default UserAvatar;
