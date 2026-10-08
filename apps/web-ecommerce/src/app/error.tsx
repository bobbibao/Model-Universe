'use client';

import Link from '@/i18n/navigation';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center text-black dark:bg-store dark:text-store-text">
      <p className="text-6xl font-extrabold text-danger">Lỗi</p>
      <h1 className="mt-4 text-3xl font-bold">Đã có lỗi xảy ra</h1>
      <p className="mt-3 text-body dark:text-store-muted">Vui lòng thử lại. Nếu lỗi vẫn tiếp diễn, hãy quay lại sau.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <button
          onClick={reset}
          className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover"
        >
          Thử lại
        </button>
        <Link
          href="/"
          className="rounded-md bg-gray px-6 py-3 font-semibold text-black hover:opacity-90 dark:bg-store-card dark:text-store-text"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
