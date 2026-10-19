'use client';

import { FormEvent, useState, useEffect } from 'react';
import Link from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import Api from '@/core/client/api/Api';
import PasswordField from '../components/PasswordField';
import TextField from '@/components/FormElements/TextField';
import { useLogin } from '@/shared/client/hooks/useLogin';
import { getSafeRedirect } from '@/shared/client/utils/NavigationUtils';
import { withoutLocale } from '@/i18n/config';
import AuthCard, { primaryButtonClassName } from '../components/AuthCard';

const MIN_PASSWORD_LENGTH = 6;

const SignIn = () => {
  const router = useRouter();
  const locale = useLocale();
  const en = locale === 'en';
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  useEffect(() => {
    let active = true;
    Api.get('/auth/providers')
      .then(({ data }) => {
        if (active) setGoogleEnabled(data?.google === true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const searchParams = useSearchParams();
  const { login } = useLogin();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setLoginFailed(false);
    const nextErrors: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = en ? 'Enter a valid email address.' : 'Vui lòng nhập email hợp lệ.';
    if (password.length < MIN_PASSWORD_LENGTH)
      nextErrors.password = en
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
        : `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const user = await login(email.trim(), password);
    setSubmitting(false);
    if (!user) setLoginFailed(true);
    if (user) {
      const fallback = user.role === 'ADMIN' ? '/admin/dashboard' : '/';
      router.push(withoutLocale(getSafeRedirect(searchParams.get('redirect'), fallback)));
      router.refresh();
    }
  };

  return (
    <AuthCard
      title={en ? 'Welcome back' : 'Chào mừng trở lại'}
      description={
        en
          ? 'Sign in to follow your orders and find your next favourite model.'
          : 'Đăng nhập để theo dõi đơn hàng và tìm mô hình yêu thích tiếp theo.'
      }
    >
      {searchParams.get('google') && (
        <p role="alert" className="mb-5 rounded-xl bg-danger/10 p-4 text-sm text-danger">
          {en
            ? 'Google sign-in could not be completed. Try again or use your email and password.'
            : 'Chưa thể đăng nhập Google. Hãy thử lại hoặc dùng email và mật khẩu.'}
        </p>
      )}
      {googleEnabled && (
        <>
          <a
            href={`/api/auth/google?${new URLSearchParams({ locale, redirect: getSafeRedirect(searchParams.get('redirect'), '') })}`}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-stroke bg-white px-4 py-3 font-semibold text-black transition hover:bg-gray focus-visible:outline focus-visible:outline-brand-hover"
          >
            <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20">
              <path
                fill="#4285F4"
                d="M43.6 20.5H24v8h11.3C33.8 33.1 29.8 36 24 36a12 12 0 1 1 8.5-20.5l5.7-5.7A20 20 0 1 0 24 44c11.5 0 20-8.1 20-20 0-1.2-.1-2.4-.4-3.5Z"
              />
              <path
                fill="#34A853"
                d="m8.3 36.3 6.6-5.1A12 12 0 0 0 24 36c3 0 5.5-.8 7.5-2.3l6.4 5C34.4 42.1 29.6 44 24 44c-6.4 0-12.1-3-15.7-7.7Z"
              />
              <path fill="#FBBC05" d="M4 24c0-3.2.7-6.2 2.1-8.9l6.7 5.2a12 12 0 0 0 0 7.4l-6.7 5.2A20 20 0 0 1 4 24Z" />
              <path
                fill="#EA4335"
                d="M24 4c5.4 0 10.1 2 14.2 5.8l-5.7 5.7A12 12 0 0 0 14.9 17l-6.6-5.1A20 20 0 0 1 24 4Z"
              />
            </svg>
            {en ? 'Continue with Google' : 'Tiếp tục với Google'}
          </a>
          <div className="my-6 flex items-center gap-4 text-xs text-body dark:text-store-muted">
            <span className="h-px flex-1 bg-stroke dark:bg-store-card" />
            {en ? 'or sign in with email' : 'hoặc đăng nhập bằng email'}
            <span className="h-px flex-1 bg-stroke dark:bg-store-card" />
          </div>
        </>
      )}
      {loginFailed && (
        <p role="alert" className="mb-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {en
            ? 'Unable to sign in. Check your details and try again.'
            : 'Chưa thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại.'}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={submitting} noValidate>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          maxLength={254}
          className="[&_input]:rounded-xl"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <PasswordField
          label={en ? 'Password' : 'Mật khẩu'}
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder={en ? 'Enter your password' : 'Nhập mật khẩu'}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />
        <div className="-mt-2 text-right">
          <Link
            href={`/auth/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="rounded text-sm font-medium text-brand-hover hover:underline focus-visible:outline focus-visible:outline-brand-hover"
          >
            {en ? 'Forgot password?' : 'Quên mật khẩu?'}
          </Link>
        </div>
        <button type="submit" className={primaryButtonClassName} disabled={submitting}>
          {submitting ? (en ? 'Signing in…' : 'Đang đăng nhập…') : en ? 'Sign in' : 'Đăng nhập'}
        </button>
      </form>
      <p className="mt-6 text-center text-body dark:text-store-muted">
        {en ? 'New to Model Universe?' : 'Chưa có tài khoản?'}{' '}
        <Link href="/auth/signup" className="font-medium text-brand-hover hover:underline">
          {en ? 'Create an account' : 'Đăng ký ngay'}
        </Link>
      </p>
    </AuthCard>
  );
};

export default SignIn;
