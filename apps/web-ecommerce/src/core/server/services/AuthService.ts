import crypto from 'crypto';
import UserModel from '../database/internal/models/User.Model';
import EmailVerificationModel from '../database/internal/models/EmailVerification.Model';
import MailService from './MailService';
import { toPublicUser } from './UserService';
import HttpError from '../../../shared/server/utils/HttpError';
import { hashPassword, verifyPassword } from '../../../shared/server/utils/PasswordUtils';
import {
  signRegistrationToken,
  signSessionToken,
  verifyRegistrationToken,
} from '../../../shared/server/utils/JwtUtils';
import {
  MIN_PASSWORD_LENGTH,
  asTrimmedString,
  isNonEmpty,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
} from '../../../shared/server/utils/ValidationUtils';
import type { AuthUser } from '../../../shared/server/types/express';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const REGISTRATION_TOKEN_TTL_SECONDS = 15 * 60;
const MIN_ADDRESS_LENGTH = 4;

export interface RegisterInput {
  registrationToken?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  phone?: string;
  address?: string;
  password?: string;
  confirmPassword?: string;
}

export default class AuthService {
  private mailService = new MailService();

  private hashOtp(email: string, otp: string): string {
    return crypto
      .createHmac('sha256', process.env.JWT_SECRET || '')
      .update(`${email}:${otp}`)
      .digest('hex');
  }

  private otpMatches(record: EmailVerificationModel, email: string, otp: string): boolean {
    const expected = Buffer.from(record.otpHash, 'hex');
    const actual = Buffer.from(this.hashOtp(email, otp), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  private validatePassword(password: unknown, confirmPassword: unknown, errors: string[]) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
    } else if (password !== confirmPassword) {
      errors.push('Mật khẩu nhập lại không khớp.');
    }
  }

  // Step 1 of registration: send a one-time code to an email that is not registered yet.
  async requestRegisterOtp(rawEmail: unknown): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) throw HttpError.badRequest('Email không hợp lệ.');
    if (await UserModel.findOne({ where: { email } })) throw HttpError.conflict('Email đã tồn tại.');

    const latest = await EmailVerificationModel.findOne({
      where: { email, purpose: 'REGISTER' },
      order: [['createdAt', 'DESC']],
    });
    if (latest) {
      const secondsSinceLast = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (secondsSinceLast < OTP_RESEND_SECONDS) {
        throw HttpError.tooManyRequests(
          `Vui lòng đợi ${Math.ceil(OTP_RESEND_SECONDS - secondsSinceLast)} giây trước khi gửi lại mã.`,
        );
      }
    }

    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    await EmailVerificationModel.destroy({ where: { email, purpose: 'REGISTER' } });
    await EmailVerificationModel.create({
      email,
      purpose: 'REGISTER',
      otpHash: this.hashOtp(email, otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    });
    await this.mailService.sendRegistrationOtp(email, otp, OTP_TTL_MINUTES);
  }

  // Step 2: check the code and hand out a short-lived registration token for step 3.
  async verifyRegisterOtp(rawEmail: unknown, rawOtp: unknown): Promise<{ registrationToken: string }> {
    const email = normalizeEmail(rawEmail);
    const otp = asTrimmedString(rawOtp);
    const record = await EmailVerificationModel.findOne({
      where: { email, purpose: 'REGISTER' },
      order: [['createdAt', 'DESC']],
    });
    if (!record) throw HttpError.badRequest('Vui lòng yêu cầu gửi mã OTP trước.');
    if (record.expiresAt.getTime() < Date.now()) throw HttpError.badRequest('Mã OTP đã hết hạn, vui lòng gửi lại mã.');
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw HttpError.badRequest('Bạn đã nhập sai quá nhiều lần, vui lòng gửi lại mã.');
    }
    if (!/^\d{6}$/.test(otp) || !this.otpMatches(record, email, otp)) {
      await record.increment('attempts');
      throw HttpError.badRequest('Mã OTP không chính xác.');
    }

    await record.update({ verifiedAt: new Date() });
    return { registrationToken: await signRegistrationToken(email, REGISTRATION_TOKEN_TTL_SECONDS) };
  }

  // Step 3: create the account for the verified email.
  async register(input: RegisterInput): Promise<AuthUser> {
    const claims = await verifyRegistrationToken(input.registrationToken);
    if (!claims) throw HttpError.badRequest('Phiên đăng ký đã hết hạn, vui lòng xác thực email lại.');
    const email = claims.email;

    const verification = await EmailVerificationModel.findOne({ where: { email, purpose: 'REGISTER' } });
    if (!verification?.verifiedAt) throw HttpError.badRequest('Email chưa được xác thực, vui lòng xác thực lại.');

    const errors: string[] = [];
    if (!isNonEmpty(input.firstName)) errors.push('Tên không được để trống.');
    if (!isNonEmpty(input.lastName)) errors.push('Họ không được để trống.');
    if (input.gender !== 'M' && input.gender !== 'F') errors.push('Vui lòng chọn giới tính.');
    if (!isValidPhone(asTrimmedString(input.phone))) errors.push('Số điện thoại không hợp lệ.');
    if (!isNonEmpty(input.address, MIN_ADDRESS_LENGTH)) errors.push('Địa chỉ phải có ít nhất 4 ký tự.');
    this.validatePassword(input.password, input.confirmPassword, errors);
    if (errors.length > 0) throw HttpError.badRequest('Thông tin đăng ký chưa hợp lệ.', errors);

    if (await UserModel.findOne({ where: { email } })) throw HttpError.conflict('Email đã tồn tại.');

    const user = await UserModel.create({
      email,
      passwordHash: await hashPassword(input.password as string),
      firstName: asTrimmedString(input.firstName),
      lastName: asTrimmedString(input.lastName),
      gender: input.gender,
      phone: asTrimmedString(input.phone),
      address: asTrimmedString(input.address),
      role: 'USER',
      isActive: true,
    });
    await EmailVerificationModel.destroy({ where: { email, purpose: 'REGISTER' } });
    return toPublicUser(user);
  }

  async login(rawEmail: unknown, password: unknown): Promise<{ user: AuthUser; token: string }> {
    const email = normalizeEmail(rawEmail);
    const user = await UserModel.scope('withPassword').findOne({ where: { email } });
    const passwordMatches =
      !!user && typeof password === 'string' && (await verifyPassword(password, user.passwordHash));
    // Same message for unknown email and wrong password.
    if (!user || !passwordMatches) throw HttpError.badRequest('Email hoặc mật khẩu không chính xác.');
    if (!user.isActive) throw HttpError.forbidden('Tài khoản của bạn đã bị khoá.');

    return { user: toPublicUser(user), token: await signSessionToken(user.id, user.role) };
  }

  // Step-up: the signed-in user re-enters the password; the new session token records when (`step_up_at`), and the
  // agent gateway accepts a high-tier approval for STEP_UP_MAX_AGE_SECONDS after it.
  async stepUp(userId: number, password: unknown): Promise<{ token: string; stepUpAt: number }> {
    const user = await UserModel.scope('withPassword').findByPk(userId);
    if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) {
      throw HttpError.badRequest('Mật khẩu không chính xác.');
    }
    const stepUpAt = Math.floor(Date.now() / 1000);
    return { token: await signSessionToken(user.id, user.role, stepUpAt), stepUpAt };
  }

  async changePassword(userId: number, oldPassword: unknown, newPassword: unknown, confirmPassword: unknown) {
    const user = await UserModel.scope('withPassword').findByPk(userId);
    if (!user) throw HttpError.notFound('Không tìm thấy tài khoản.');
    if (typeof oldPassword !== 'string' || !(await verifyPassword(oldPassword, user.passwordHash))) {
      throw HttpError.badRequest('Mật khẩu cũ không chính xác.');
    }
    const errors: string[] = [];
    this.validatePassword(newPassword, confirmPassword, errors);
    if (errors.length > 0) throw HttpError.badRequest('Mật khẩu mới chưa hợp lệ.', errors);

    await user.update({ passwordHash: await hashPassword(newPassword as string) });
  }
}
