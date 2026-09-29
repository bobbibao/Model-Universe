import type { UserGender, UserRole } from '../../../core/server/database/internal/models/User.Model';

// The authenticated user attached to the request by AuthenticationMiddleware.
export interface AuthUser {
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
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      // Raw JSON body, kept by server.ts for signature verification.
      rawBody?: Buffer;
    }
  }
}
