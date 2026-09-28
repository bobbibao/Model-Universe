import nodemailer, { Transporter } from 'nodemailer';
import Logger from '../../../shared/server/utils/logger';

const SHOP_NAME = 'Clothing Shop';

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
