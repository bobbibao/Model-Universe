'use client';

import Api from './Api';
import { AUTH_API } from './endpoint';
import type { RegisterProfile, User } from '@/shared/types/user';

// The session lives in an httpOnly cookie set by the API, so no token is handled on the client.
export default class AuthApi {
  static async requestRegisterOtp(email: string): Promise<boolean> {
    try {
      await Api.post(AUTH_API.REQUEST_REGISTER_OTP, { email });
      return true;
    } catch (error) {
      return false;
    }
  }

  static async verifyRegisterOtp(email: string, otp: string): Promise<string | undefined> {
    try {
      const response = await Api.post(AUTH_API.VERIFY_REGISTER_OTP, { email, otp });
      return response.data?.registrationToken;
    } catch (error) {
      return undefined;
    }
  }

  static async register(registrationToken: string, profile: RegisterProfile): Promise<User | undefined> {
    try {
      const response = await Api.post(AUTH_API.REGISTER, { registrationToken, ...profile });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async login(email: string, password: string): Promise<User | undefined> {
    try {
      const response = await Api.post(AUTH_API.LOGIN, { email, password });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async logout(): Promise<boolean> {
    try {
      await Api.post(AUTH_API.LOGOUT);
      return true;
    } catch (error) {
      return false;
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      const response = await Api.get(AUTH_API.ME);
      return response.data?.user ?? null;
    } catch (error) {
      return null;
    }
  }

  // Re-enter the password before approving a high-tier agent option (valid for a few minutes).
  static async stepUp(password: string): Promise<boolean> {
    try {
      await Api.post(AUTH_API.STEP_UP, { password });
      return true;
    } catch (error) {
      return false;
    }
  }

  static async changePassword(oldPassword: string, newPassword: string, confirmPassword: string): Promise<boolean> {
    try {
      await Api.post(AUTH_API.CHANGE_PASSWORD, { oldPassword, newPassword, confirmPassword });
      return true;
    } catch (error) {
      return false;
    }
  }
}
