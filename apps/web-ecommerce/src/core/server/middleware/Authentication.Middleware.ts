import { NextFunction, Request, Response } from 'express';
import { adminRoutes, protectedRoutes } from '../routes/Auth.Route';
import Logger from '../../../shared/server/utils/logger';
import ApiResponse from '../../../shared/server/utils/ApiResponseUtils';
import { AUTH_COOKIE_NAME, getAuthCookieOptions, verifySessionToken } from '../../../shared/server/utils/JwtUtils';
import UserModel from '../database/internal/models/User.Model';
import { toPublicUser } from '../services/UserService';

const matchesRoute = (path: string, route: string) => path === route || path.startsWith(`${route}/`);

const reject = (res: Response, statusCode: number, message: string) =>
  new ApiResponse({ statusCode, toastType: 'error', userMessages: [message] }).send(res);

export async function AuthenticationMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    const claims = await verifySessionToken(token);
    if (claims) {
      // Reload the user on every request so role changes and deactivation apply immediately.
      const user = await UserModel.findByPk(Number(claims.sub));
      if (user?.isActive) {
        req.user = toPublicUser(user);
      }
    }
    if (token && !req.user) {
      // Expired/invalid token or a deactivated account: drop the stale cookie.
      const { httpOnly, sameSite, secure, path } = getAuthCookieOptions();
      res.clearCookie(AUTH_COOKIE_NAME, { httpOnly, sameSite, secure, path });
    }

    const isAdminRoute = adminRoutes.some((route) => matchesRoute(req.path, route));
    const isProtectedRoute = isAdminRoute || protectedRoutes.some((route) => matchesRoute(req.path, route));

    if (isProtectedRoute && !req.user) {
      return reject(
        res,
        401,
        token ? 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.' : 'Bạn cần đăng nhập để tiếp tục.',
      );
    }
    if (isAdminRoute && req.user?.role !== 'ADMIN') {
      return reject(res, 403, 'Bạn không có quyền truy cập trang quản trị.');
    }

    next();
  } catch (error) {
    Logger.ERROR('Authentication error:', error);
    return reject(res, 401, 'Không thể xác thực phiên đăng nhập.');
  }
}
