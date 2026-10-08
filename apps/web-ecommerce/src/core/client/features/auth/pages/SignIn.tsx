'use client';

import { FormEvent, useState } from 'react';
import Link from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import TextField from '@/components/FormElements/TextField';
import { useLogin } from '@/shared/client/hooks/useLogin';
import { getSafeRedirect } from '@/shared/client/utils/NavigationUtils';
import { withoutLocale } from '@/i18n/config';
import AuthCard, { primaryButtonClassName } from '../components/AuthCard';

const MIN_PASSWORD_LENGTH = 6;

const SignIn = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useLogin();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = 'Vui lòng nhập email.';
    if (password.length < MIN_PASSWORD_LENGTH)
      nextErrors.password = `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const user = await login(email.trim(), password);
    setSubmitting(false);
    if (user) {
      const fallback = user.role === 'ADMIN' ? '/admin/dashboard' : '/';
      router.push(withoutLocale(getSafeRedirect(searchParams.get('redirect'), fallback)));
      router.refresh();
    }
  };

  return (
    <AuthCard title="Đăng nhập">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Nhập email của bạn"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <TextField
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />
        <button type="submit" className={primaryButtonClassName} disabled={submitting}>
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
      <p className="mt-6 text-center text-body dark:text-store-muted">
        Chưa có tài khoản?{' '}
        <Link href="/auth/signup" className="font-medium text-brand-hover hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </AuthCard>
  );
};

export default SignIn;
