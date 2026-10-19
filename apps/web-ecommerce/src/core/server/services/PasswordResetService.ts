import crypto from 'crypto';
import { Op } from 'sequelize';
import UserModel from '../database/internal/models/User.Model';
import EmailVerificationModel from '../database/internal/models/EmailVerification.Model';
import MailService from './MailService';
import HttpError from '../../../shared/server/utils/HttpError';
import { hashPassword } from '../../../shared/server/utils/PasswordUtils';
import { isValidEmail, normalizeEmail, MIN_PASSWORD_LENGTH } from '../../../shared/server/utils/ValidationUtils';
import { shopOrigin } from '../../../shared/server/utils/ShopOrigin';
import Logger from '../../../shared/server/utils/logger';

const TTL_MINUTES = 15;
const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const invalidLink = () => HttpError.badRequest('Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.');

export default class PasswordResetService {
  async request(rawEmail: unknown, locale: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) throw HttpError.badRequest('Email không hợp lệ.');
    const origin = shopOrigin();
    const database = UserModel.sequelize!;
    const token = crypto.randomBytes(32).toString('hex');
    const shouldSend = await database.transaction(async (transaction) => {
      // Serialize requests for the same email across server processes, including concurrent resends.
      await database.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `password-reset:${email}` },
        transaction,
      });
      const user = await UserModel.findOne({ where: { email, isActive: true }, transaction });
      if (!user) return false;
      const latest = await EmailVerificationModel.findOne({
        where: { email, purpose: 'RESET_PASSWORD' },
        order: [['createdAt', 'DESC']],
        transaction,
      });
      if (latest && Date.now() - latest.createdAt.getTime() < 60_000) return false;
      await EmailVerificationModel.destroy({ where: { email, purpose: 'RESET_PASSWORD' }, transaction });
      await EmailVerificationModel.create(
        {
          email,
          purpose: 'RESET_PASSWORD',
          otpHash: digest(token),
          expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
        },
        { transaction },
      );
      return true;
    });
    if (!shouldSend) return;
    const link = `${origin}/${locale === 'en' ? 'en' : 'vi'}/auth/reset-password#token=${token}`;
    try {
      await new MailService().sendTransactional(
        email,
        'Đặt lại mật khẩu',
        `Bạn vừa yêu cầu đặt lại mật khẩu Model Universe. Mở liên kết sau trong ${TTL_MINUTES} phút:\n${link}\n\nNếu không phải bạn yêu cầu, hãy bỏ qua email này. Không chia sẻ liên kết cho người khác.`,
      );
    } catch {
      // Never disclose whether an account exists, even when the email provider fails.
      await EmailVerificationModel.destroy({ where: { email, purpose: 'RESET_PASSWORD', otpHash: digest(token) } });
      // Operational logs omit email and token.
      Logger.ERROR('Password reset email delivery failed');
    }
  }

  async reset(token: unknown, password: unknown, confirmPassword: unknown): Promise<void> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalidLink();
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 128)
      throw HttpError.badRequest(`Mật khẩu phải có từ ${MIN_PASSWORD_LENGTH} đến 128 ký tự.`);
    if (password !== confirmPassword) throw HttpError.badRequest('Mật khẩu nhập lại không khớp.');
    const passwordHash = await hashPassword(password);
    await UserModel.sequelize!.transaction(async (transaction) => {
      // Lock and consume the token in the same transaction as the password update; concurrent reuse fails.
      const records = await EmailVerificationModel.findAll({
        where: { purpose: 'RESET_PASSWORD', otpHash: digest(token), expiresAt: { [Op.gt]: new Date() } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const record = records[0];
      if (!record) throw invalidLink();
      const user = await UserModel.findOne({
        where: { email: record.email, isActive: true },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) throw invalidLink();
      await user.update({ passwordHash, sessionVersion: user.sessionVersion + 1 }, { transaction });
      await record.destroy({ transaction });
    });
  }
}
