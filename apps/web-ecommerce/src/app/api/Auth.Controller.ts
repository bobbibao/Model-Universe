import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type AuthService from '../../core/server/services/AuthService';
import HttpError from '../../shared/server/utils/HttpError';
import { AUTH_COOKIE_NAME, getAuthCookieOptions, getStepUpMaxAgeSeconds } from '../../shared/server/utils/JwtUtils';

@Controller('/auth')
@ControllerModel('AuthModel')
export default class AuthController extends ApiBaseController {
  @Post('/register/request-otp')
  async requestRegisterOtp(req: Request, res: Response) {
    try {
      const service = await this.requireService<AuthService>();
      await service.requestRegisterOtp(req.body?.email);
      return this.sendSuccess(res, undefined, 'Mã OTP đã được gửi tới email của bạn.');
    } catch (error) {
      return this.handleError(res, error, "AuthController's requestRegisterOtp");
    }
  }

  @Post('/register/verify-otp')
  async verifyRegisterOtp(req: Request, res: Response) {
    try {
      const service = await this.requireService<AuthService>();
      const result = await service.verifyRegisterOtp(req.body?.email, req.body?.otp);
      return this.sendSuccess(res, result, 'Xác thực email thành công.');
    } catch (error) {
      return this.handleError(res, error, "AuthController's verifyRegisterOtp");
    }
  }

  @Post('/register')
  async register(req: Request, res: Response) {
    try {
      const service = await this.requireService<AuthService>();
      const user = await service.register(req.body || {});
      return this.sendSuccess(res, user, 'Đăng ký tài khoản thành công.', 201);
    } catch (error) {
      return this.handleError(res, error, "AuthController's register");
    }
  }

  @Post('/login')
  async login(req: Request, res: Response) {
    try {
      const service = await this.requireService<AuthService>();
      const { user, token } = await service.login(req.body?.email, req.body?.password);
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      return this.sendSuccess(res, user, 'Đăng nhập thành công.');
    } catch (error) {
      return this.handleError(res, error, "AuthController's login");
    }
  }

  @Post('/logout')
  async logout(_: Request, res: Response) {
    // maxAge must not be passed to clearCookie, otherwise it overrides the expiry and the cookie survives.
    const { httpOnly, sameSite, secure, path } = getAuthCookieOptions();
    res.clearCookie(AUTH_COOKIE_NAME, { httpOnly, sameSite, secure, path });
    return this.sendSuccess(res, undefined, 'Đăng xuất thành công.');
  }

  // Public: returns the current user, or null for guests.
  @Get('/me')
  async me(req: Request, res: Response) {
    return res.json({ user: req.user ?? null });
  }

  // Re-enter the password before a high-tier agent approval (docs/GROWTH_AGENT.md section 4).
  @Post('/step-up')
  async stepUp(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<AuthService>();
      const { token, stepUpAt } = await service.stepUp(req.user.id, req.body?.password);
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      return this.sendSuccess(res, { stepUpAt, maxAgeSeconds: getStepUpMaxAgeSeconds() }, 'Đã xác thực lại.');
    } catch (error) {
      return this.handleError(res, error, "AuthController's stepUp");
    }
  }

  @Post('/change-password')
  async changePassword(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<AuthService>();
      const { oldPassword, newPassword, confirmPassword } = req.body || {};
      await service.changePassword(req.user.id, oldPassword, newPassword, confirmPassword);
      return this.sendSuccess(res, undefined, 'Đổi mật khẩu thành công.');
    } catch (error) {
      return this.handleError(res, error, "AuthController's changePassword");
    }
  }
}
