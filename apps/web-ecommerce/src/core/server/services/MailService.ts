import nodemailer, { Transporter } from 'nodemailer';
import { Op, Transaction } from 'sequelize';
import Logger from '../../../shared/server/utils/logger';
import AdminNotificationModel, { NotificationSeverity } from '../database/client/models/AdminNotification.Model';
import UserModel from '../database/internal/models/User.Model';

const SHOP_NAME = 'Clothing Shop';
export const NOTIFICATIONS_PER_DAY = 20;
const VN_OFFSET_MS = 7 * 3600_000;

export interface AdminNotice {
  subject: string;
  message: string;
  severity?: NotificationSeverity;
  dedupeKey?: string | null;
}

// Midnight of the instant's day in Vietnam, as an instant.
const vnDayStart = (instant: Date) => {
  const local = new Date(instant.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN_OFFSET_MS);
};

export default class MailService {
  private static transporter: Transporter | null | undefined;

  // Built once from SMTP_* env vars; null when SMTP is not configured.
  private static getTransporter(): Transporter | null {
    if (MailService.transporter === undefined) {
      const host = process.env.SMTP_HOST;
      MailService.transporter = host
        ? nodemailer.createTransport({
            host,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
          })
        : null;
    }
    return MailService.transporter;
  }

  async sendRegistrationOtp(email: string, otp: string, ttlMinutes: number): Promise<void> {
    const subject = `Mã xác thực đăng ký tài khoản ${SHOP_NAME}`;
    const text = `Mã xác thực của bạn là ${otp}. Mã có hiệu lực trong ${ttlMinutes} phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.`;
    await this.send(email, subject, text, otp);
  }

  // Emails every active admin about the agent (protective actions, overspend, the agent's own notices). At most
  // NOTIFICATIONS_PER_DAY a day (Vietnam), and a `dedupeKey` is sent once a day; both are answered, not refused.
  async sendNotification(notice: AdminNotice, transaction?: Transaction, now = new Date()): Promise<string> {
    const since = vnDayStart(now);
    const today = await AdminNotificationModel.findAll({
      where: { createdAt: { [Op.gte]: since } },
      attributes: ['dedupeKey'],
      transaction,
    });
    if (notice.dedupeKey && today.some((row) => row.dedupeKey === notice.dedupeKey)) return 'already sent today';
    if (today.length >= NOTIFICATIONS_PER_DAY) return `not sent: ${NOTIFICATIONS_PER_DAY} notifications today already`;

    const admins = await UserModel.findAll({
      where: { role: 'ADMIN', isActive: true },
      attributes: ['email'],
      transaction,
    });
    const subject = `[${SHOP_NAME}] ${notice.subject}`;
    const transporter = MailService.getTransporter();
    for (const admin of admins) {
      if (!transporter) {
        Logger.INFO(`[MailService] SMTP is not configured - notification for ${admin.email}: ${subject}`);
        continue;
      }
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: admin.email,
        subject,
        text: notice.message,
      });
    }
    await AdminNotificationModel.create(
      {
        subject: notice.subject,
        message: notice.message,
        severity: notice.severity ?? 'info',
        dedupeKey: notice.dedupeKey ?? null,
        recipients: admins.length,
      },
      { transaction },
    );
    return `sent to ${admins.length} admin(s)`;
  }

  private async send(to: string, subject: string, text: string, otp: string): Promise<void> {
    const transporter = MailService.getTransporter();
    if (!transporter) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SMTP is not configured (SMTP_HOST is empty)');
      }
      // Development fallback: without SMTP the code is written to the server log so the flow can be completed locally.
      Logger.INFO(`[MailService] SMTP is not configured - OTP for ${to}: ${otp}`);
      return;
    }
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: `<p>${text.replace(otp, `<strong style="font-size:20px;letter-spacing:4px">${otp}</strong>`)}</p>`,
    });
  }
}
