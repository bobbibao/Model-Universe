'use client';

import { FormEvent, useEffect, useState } from 'react';
import TextField, { inputClassName } from '@/components/FormElements/TextField';
import ContactApi from '@/core/client/api/Contact';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import type { ContactMessageInput } from '@/shared/types/contact';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 10;
const emptyForm: ContactMessageInput = { name: '', email: '', phone: '', company: '', message: '' };

type ContactErrors = Partial<Record<keyof ContactMessageInput, string>>;

const Contact = () => {
  const { user } = useCurrentUser();
  const [form, setForm] = useState<ContactMessageInput>(emptyForm);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Signed-in customers do not have to type their details again.
  useEffect(() => {
    if (user) {
      setForm((current) => ({
        ...current,
        name: current.name || `${user.lastName} ${user.firstName}`.trim(),
        email: current.email || user.email,
        phone: current.phone || user.phone || '',
      }));
    }
  }, [user]);

  const update = (key: keyof ContactMessageInput) => (value: string) => setForm({ ...form, [key]: value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: ContactErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Vui lòng nhập họ tên.';
    if (!EMAIL_PATTERN.test(form.email.trim())) nextErrors.email = 'Email không hợp lệ.';
    if (form.message.trim().length < MIN_MESSAGE_LENGTH) {
      nextErrors.message = `Nội dung phải có ít nhất ${MIN_MESSAGE_LENGTH} ký tự.`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSending(true);
    const ok = await ContactApi.sendMessage(form);
    setSending(false);
    if (ok) {
      setSent(true);
      setForm(emptyForm);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2">
      <div>
        <h1 className="mb-4 text-4xl font-bold">Liên hệ</h1>
        <p className="mb-8 text-body dark:text-store-muted">
          Bạn có câu hỏi về sản phẩm, đơn hàng hay muốn hợp tác? Hãy để lại lời nhắn, chúng tôi sẽ phản hồi trong thời
          gian sớm nhất.
        </p>
        <div className="flex flex-col gap-2">
          <p className="font-semibold">Văn phòng Việt Nam</p>
          <p>123 Vạn Kiếp, Phường 3, Quận Bình Thạnh, TP. Hồ Chí Minh</p>
          <p>Điện thoại: +84 373 498 729</p>
          <p>Email: lehoangbao5678@gmail.com</p>
        </div>
      </div>

      <div className="rounded-md border border-stroke bg-white p-6 dark:border-store-card dark:bg-store-panel sm:p-8">
        {sent ? (
          <div className="py-10 text-center">
            <p className="mb-2 text-2xl font-semibold">Cảm ơn bạn đã liên hệ!</p>
            <p className="mb-6 text-body dark:text-store-muted">Chúng tôi sẽ phản hồi qua email của bạn.</p>
            <button onClick={() => setSent(false)} className="font-medium text-brand-hover hover:underline">
              Gửi tin nhắn khác
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <TextField
              label="Họ tên"
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={(event) => update('name')(event.target.value)}
              error={errors.name}
            />
            <TextField
              label="Công ty"
              name="company"
              placeholder="Không bắt buộc"
              autoComplete="organization"
              value={form.company}
              onChange={(event) => update('company')(event.target.value)}
            />
            <TextField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => update('email')(event.target.value)}
              error={errors.email}
            />
            <TextField
              label="Số điện thoại"
              name="phone"
              type="tel"
              placeholder="Không bắt buộc"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => update('phone')(event.target.value)}
            />
            <div className="sm:col-span-2">
              <label htmlFor="message" className="mb-2 block text-sm font-medium text-black dark:text-white">
                Nội dung
              </label>
              <textarea
                id="message"
                rows={6}
                maxLength={2000}
                className={`${inputClassName} ${errors.message ? 'border-danger' : ''}`}
                value={form.message}
                onChange={(event) => update('message')(event.target.value)}
              />
              {errors.message && <p className="mt-1 text-sm text-danger">{errors.message}</p>}
            </div>
            <button
              type="submit"
              disabled={sending}
              className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60 sm:col-span-2"
            >
              {sending ? 'Đang gửi...' : 'Gửi tin nhắn'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Contact;
