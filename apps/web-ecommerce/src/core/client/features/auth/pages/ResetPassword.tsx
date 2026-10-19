'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import AuthApi from '@/core/client/api/Auth';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import AuthCard, { primaryButtonClassName } from '../components/AuthCard';
import PasswordField from '../components/PasswordField';

export default function ResetPassword() {
  const en = useLocale() === 'en';
  const { setUser } = useCurrentUser();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const tokenRead = useRef(false);
  useEffect(() => {
    if (tokenRead.current) return;
    tokenRead.current = true;
    // Keep reset credentials out of request logs and referrers, and remove them from browser history.
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setToken(/^[a-f0-9]{64}$/.test(value) ? value : '');
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !token) return;
    const next: typeof errors = {};
    if (password.length < 6 || password.length > 128)
      next.password = en ? 'Use 6–128 characters.' : 'Mật khẩu cần có từ 6 đến 128 ký tự.';
    if (confirm !== password) next.confirm = en ? 'Passwords do not match.' : 'Mật khẩu nhập lại không khớp.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const ok = await AuthApi.resetPassword(token, password, confirm);
    setBusy(false);
    if (ok) {
      setDone(true);
      setToken('');
      setPassword('');
      setConfirm('');
      setUser(null);
    } else
      setErrors({
        form: en
          ? 'The link may have expired or already been used. Try again or request a new link.'
          : 'Liên kết có thể đã hết hạn hoặc được sử dụng. Hãy thử lại hoặc yêu cầu liên kết mới.',
      });
  };
  return (
    <AuthCard
      title={done ? (en ? 'Password updated' : 'Đã đặt lại mật khẩu') : en ? 'Set a new password' : 'Đặt mật khẩu mới'}
      description={
        done
          ? en
            ? 'Your previous sessions have been signed out. Sign in with your new password.'
            : 'Các phiên đăng nhập cũ đã được đăng xuất. Bạn có thể đăng nhập bằng mật khẩu mới.'
          : en
            ? 'Choose a password you haven’t used on another website.'
            : 'Chọn mật khẩu mà bạn chưa sử dụng ở website khác.'
      }
    >
      {done ? (
        <Link href="/auth/signin" className={`${primaryButtonClassName} block text-center`}>
          {en ? 'Sign in' : 'Đăng nhập'}
        </Link>
      ) : token === null ? (
        <p role="status">{en ? 'Checking link…' : 'Đang kiểm tra liên kết…'}</p>
      ) : !token ? (
        <p role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">
          {en
            ? 'This link is invalid. Request a new reset link.'
            : 'Liên kết không hợp lệ. Vui lòng yêu cầu liên kết mới.'}
        </p>
      ) : (
        <form onSubmit={submit} noValidate aria-busy={busy} className="flex flex-col gap-5">
          {errors.form && (
            <p role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">
              {errors.form}
            </p>
          )}
          <PasswordField
            name="password"
            label={en ? 'New password' : 'Mật khẩu mới'}
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <PasswordField
            name="confirmPassword"
            label={en ? 'Confirm new password' : 'Nhập lại mật khẩu mới'}
            autoComplete="new-password"
            required
            maxLength={128}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <button type="submit" className={primaryButtonClassName} disabled={busy}>
            {busy ? (en ? 'Saving…' : 'Đang lưu…') : en ? 'Save new password' : 'Lưu mật khẩu mới'}
          </button>
        </form>
      )}
      {!done && (
        <p className="mt-6 text-center text-sm">
          <Link href="/auth/forgot-password" className="font-medium text-brand-hover hover:underline">
            {en ? 'Request a new link' : 'Yêu cầu liên kết mới'}
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
