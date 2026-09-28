'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Stepper from '@/components/Stepper/Stepper';
import TextField from '@/components/FormElements/TextField';
import SelectField from '@/components/FormElements/SelectField';
import AuthApi from '@/core/client/api/Auth';
import type { RegisterProfile } from '@/shared/types/user';
import AuthCard, { primaryButtonClassName, secondaryButtonClassName } from '../components/AuthCard';

const STEPS = ['Email', 'Xác thực OTP', 'Thông tin cá nhân'];
const RESEND_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9\s.-]{8,15}$/;

const emptyProfile: RegisterProfile = {
  firstName: '',
  lastName: '',
  gender: '',
  phone: '',
  address: '',
  password: '',
  confirmPassword: '',
};

type ProfileErrors = Partial<Record<keyof RegisterProfile, string>>;

const validateProfile = (profile: RegisterProfile): ProfileErrors => {
  const errors: ProfileErrors = {};
  if (!profile.firstName.trim()) errors.firstName = 'Vui lòng nhập tên.';
  if (!profile.lastName.trim()) errors.lastName = 'Vui lòng nhập họ.';
  if (!profile.gender) errors.gender = 'Vui lòng chọn giới tính.';
  if (!PHONE_PATTERN.test(profile.phone.trim())) errors.phone = 'Số điện thoại không hợp lệ.';
  if (profile.address.trim().length < 4) errors.address = 'Địa chỉ phải có ít nhất 4 ký tự.';
  if (profile.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  if (profile.confirmPassword !== profile.password) errors.confirmPassword = 'Mật khẩu nhập lại không khớp.';
  return errors;
};

const SignUp = () => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string>();
  const [resendIn, setResendIn] = useState(0);
  const [registrationToken, setRegistrationToken] = useState('');
  const [profile, setProfile] = useState<RegisterProfile>(emptyProfile);
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendOtp = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError('Email không hợp lệ.');
      return;
    }
    setEmailError(undefined);
    setSubmitting(true);
    const sent = await AuthApi.requestRegisterOtp(email.trim());
    setSubmitting(false);
    if (sent) {
      setOtp('');
      setResendIn(RESEND_SECONDS);
      setStep(1);
    }
  };

  const handleEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await sendOtp();
  };

  const handleOtpSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp.trim())) {
      setOtpError('Mã OTP gồm 6 chữ số.');
      return;
    }
    setOtpError(undefined);
    setSubmitting(true);
    const token = await AuthApi.verifyRegisterOtp(email.trim(), otp.trim());
    setSubmitting(false);
    if (token) {
      setRegistrationToken(token);
      setStep(2);
    }
  };

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validateProfile(profile);
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const user = await AuthApi.register(registrationToken, profile);
    setSubmitting(false);
    if (user) {
      router.push(`/auth/signin?email=${encodeURIComponent(user.email)}`);
    }
  };

  const updateProfile = (field: keyof RegisterProfile) => (value: string) =>
    setProfile((current) => ({ ...current, [field]: value }));

  return (
    <AuthCard title="Đăng ký tài khoản">
      <div className="mb-8">
        <Stepper steps={STEPS} currentStep={step} />
      </div>

      {step === 0 && (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-5" noValidate>
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Nhập email của bạn"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
          />
          <button type="submit" className={primaryButtonClassName} disabled={submitting}>
            {submitting ? 'Đang gửi mã...' : 'Gửi mã OTP'}
          </button>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={handleOtpSubmit} className="flex flex-col gap-5" noValidate>
          <p className="text-body dark:text-store-muted">
            Mã xác thực đã được gửi tới <span className="font-medium text-black dark:text-white">{email}</span>.
          </p>
          <TextField
            label="Mã OTP"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Nhập mã gồm 6 chữ số"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
            error={otpError}
          />
          <button type="submit" className={primaryButtonClassName} disabled={submitting}>
            {submitting ? 'Đang xác thực...' : 'Xác thực'}
          </button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              className="text-body hover:underline dark:text-store-muted"
              onClick={() => setStep(0)}
            >
              Đổi email
            </button>
            <button
              type="button"
              className="font-medium text-brand-hover hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              disabled={resendIn > 0 || submitting}
              onClick={sendOtp}
            >
              {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : 'Gửi lại mã'}
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleProfileSubmit} className="grid grid-cols-1 gap-5 sm:grid-cols-2" noValidate>
          <TextField
            label="Tên"
            name="firstName"
            autoComplete="given-name"
            value={profile.firstName}
            onChange={(event) => updateProfile('firstName')(event.target.value)}
            error={profileErrors.firstName}
          />
          <TextField
            label="Họ"
            name="lastName"
            autoComplete="family-name"
            value={profile.lastName}
            onChange={(event) => updateProfile('lastName')(event.target.value)}
            error={profileErrors.lastName}
          />
          <SelectField
            label="Giới tính"
            name="gender"
            placeholder="Chọn giới tính"
            options={[
              { value: 'M', label: 'Nam' },
              { value: 'F', label: 'Nữ' },
            ]}
            value={profile.gender}
            onChange={(event) => updateProfile('gender')(event.target.value)}
            error={profileErrors.gender}
          />
          <TextField
            label="Số điện thoại"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={profile.phone}
            onChange={(event) => updateProfile('phone')(event.target.value)}
            error={profileErrors.phone}
          />
          <TextField
            label="Địa chỉ"
            name="address"
            autoComplete="street-address"
            className="sm:col-span-2"
            value={profile.address}
            onChange={(event) => updateProfile('address')(event.target.value)}
            error={profileErrors.address}
          />
          <TextField
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="new-password"
            value={profile.password}
            onChange={(event) => updateProfile('password')(event.target.value)}
            error={profileErrors.password}
          />
          <TextField
            label="Nhập lại mật khẩu"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={profile.confirmPassword}
            onChange={(event) => updateProfile('confirmPassword')(event.target.value)}
            error={profileErrors.confirmPassword}
          />
          <div className="flex flex-col gap-3 sm:col-span-2">
            <button type="submit" className={primaryButtonClassName} disabled={submitting}>
              {submitting ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
            </button>
            <button type="button" className={secondaryButtonClassName} onClick={() => setStep(0)} disabled={submitting}>
              Quay lại
            </button>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-body dark:text-store-muted">
        Đã có tài khoản?{' '}
        <Link href="/auth/signin" className="font-medium text-brand-hover hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
};

export default SignUp;
