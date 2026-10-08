'use client';

import Link from '@/i18n/navigation';
import StoreLayout from '@/components/Layouts/StoreLayout';

export default function NotFound() {
  return (
    <StoreLayout>
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
        <p className="text-7xl font-extrabold text-brand-hover">404</p>
        <h1 className="mt-4 text-3xl font-bold">Không tìm thấy trang</h1>
        <p className="mt-3 text-body dark:text-store-muted">Trang bạn tìm không tồn tại hoặc đã được di chuyển.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/" className="rounded-md bg-brand px-6 py-3 font-semibold text-brand-ink hover:bg-brand-hover">
            Về trang chủ
          </Link>
          <Link
            href="/shop"
            className="rounded-md bg-gray px-6 py-3 font-semibold text-black hover:opacity-90 dark:bg-store-card dark:text-store-text"
          >
            Xem sản phẩm
          </Link>
        </div>
      </div>
    </StoreLayout>
  );
}
