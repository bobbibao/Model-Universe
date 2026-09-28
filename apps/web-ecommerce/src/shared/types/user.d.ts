export type UserRole = 'USER' | 'ADMIN';

export type UserGender = 'M' | 'F';

// Current user as returned by the API (never contains the password hash).
export type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  address?: string | null;
  gender?: UserGender | null;
  role: UserRole;
  avatar?: string | null;
  isActive: boolean;
  createdAt: string;
};

export type RegisterProfile = {
  firstName: string;
  lastName: string;
  gender: UserGender | '';
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
};
