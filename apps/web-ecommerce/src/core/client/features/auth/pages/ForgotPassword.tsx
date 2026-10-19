'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import Link from '@/i18n/navigation';
import AuthApi from '@/core/client/api/Auth';
import TextField from '@/components/FormElements/TextField';
import AuthCard, { primaryButtonClassName, secondaryButtonClassName } from '../components/AuthCard';

export default function ForgotPassword() {
  const locale = useLocale();
  const en = locale === 'en';
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || seconds) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(en ? 'Enter a valid email address.' : 'Vui lòng nhập email hợp lệ.');
      return;
    }
    setError('');
    setBusy(true);
    const ok = await AuthApi.requestPasswordReset(email.trim(), locale);
    setBusy(false);
    if (ok) {
      setSent(true);
      setSeconds(60);
    } else setError(en ? 'Unable to send the request. Please try again.' : 'Chưa thể gửi yêu cầu. Vui lòng thử lại.');
  };
  return (
    <AuthCard
      title={en ? 'Forgot password?' : 'Quên mật khẩu?'}
      description={
        en
          ? 'Enter your email and we’ll send you a secure reset link.'
          : 'Nhập email của bạn, shop sẽ gửi liên kết để đặt mật khẩu mới.'
      }
    >
      {sent && (
        <div
          role="status"
          className="mb-6 rounded-xl border border-brand/40 bg-brand/10 p-4 text-sm leading-6 text-black dark:text-store-text"
        >
          <p className="font-semibold">{en ? 'Check your inbox' : 'Kiểm tra hộp thư của bạn'}</p>
          <p className="mt-1">
            {en
              ? 'If this email has an active account, a reset link will arrive shortly. The link expires in 15 minutes. Check your spam folder too.'
              : 'Nếu email có tài khoản đang hoạt động, liên kết sẽ được gửi đến trong ít phút và có hiệu lực 15 phút. Bạn nhớ kiểm tra cả mục thư rác.'}
          </p>
        </div>
      )}
      <form onSubmit={submit} noValidate aria-busy={busy} className="flex flex-col gap-5">
        <TextField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
          className="[&_input]:rounded-xl"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSent(false);
            setError('');
          }}
          error={error}
        />
        <button className={primaryButtonClassName} disabled={busy || seconds > 0} type="submit">
          {busy
            ? en
              ? 'Sending…'
              : 'Đang gửi…'
            : seconds
              ? en
                ? `Resend in ${seconds}s`
                : `Gửi lại sau ${seconds}s`
              : sent
                ? en
                  ? 'Resend link'
                  : 'Gửi lại liên kết'
                : en
                  ? 'Send reset link'
                  : 'Gửi liên kết đặt lại'}
        </button>
        {sent && (
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => {
              setSent(false);
              setSeconds(0);
              document.getElementById('email')?.focus();
            }}
          >
            {en ? 'Use another email' : 'Dùng email khác'}
          </button>
        )}
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/auth/signin" className="font-medium text-brand-hover hover:underline">
          {en ? '← Back to sign in' : '← Quay lại đăng nhập'}
        </Link>
      </p>
    </AuthCard>
  );
}
