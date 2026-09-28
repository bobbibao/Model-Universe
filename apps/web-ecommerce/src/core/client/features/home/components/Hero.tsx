'use client';

import Image from 'next/image';
import Link from 'next/link';

const Hero = () => {
  return (
    <section className="relative flex h-[500px] items-center justify-center overflow-hidden sm:h-[700px]">
      <Image src="/images/store/hero.jpg" alt="" fill priority className="object-cover" sizes="100vw" />
      <div className="absolute inset-0 bg-store/60" />
      <div className="relative max-w-xl px-4 text-center text-store-text">
        <h1 className="text-4xl font-bold md:text-6xl">Cửa hàng tốt nhất của năm!</h1>
        <p className="py-6 text-lg md:text-2xl">
          Chúng tôi cung cấp những sản phẩm chất lượng nhất cho bạn hoạt động hàng ngày.
        </p>
        <Link
          href="/shop"
          className="inline-block rounded-md bg-brand px-12 py-3 text-lg font-semibold text-brand-ink hover:bg-brand-hover"
        >
          Mua hàng ngay
        </Link>
      </div>
    </section>
  );
};

export default Hero;
