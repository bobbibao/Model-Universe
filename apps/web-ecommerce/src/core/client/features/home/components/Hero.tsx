'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';

const Hero = () => {
  const agent = useCustomerAssistant();
  const [request, setRequest] = useState('');
  return (
    <section className="relative flex min-h-[600px] items-center overflow-hidden py-16 sm:min-h-[690px]">
      <Image src="/images/store/hero.jpg" alt="" fill priority className="object-cover" sizes="100vw" />
      <div className="absolute inset-0 bg-gradient-to-r from-store/95 via-store/80 to-store/50" />
      <div className="relative mx-auto w-full max-w-7xl px-5 text-store-text md:px-10">
        <div className="max-w-2xl">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide">
            <span className="text-brand">✦</span> MUA SẮM CÙNG AGENT
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Tìm đúng món.
            <br />
            <span className="text-brand">Có Agent cùng bạn.</span>
          </h1>
          <p className="max-w-lg py-6 text-base leading-relaxed text-white/80 sm:text-lg">
            Kể điều bạn cần. Agent giúp tìm sản phẩm, so sánh kỹ và hỗ trợ mua hàng ngay trong cuộc trò chuyện.
          </p>
          <form
            className="flex items-center gap-2 rounded-2xl border border-white/25 bg-white p-2 shadow-lg"
            onSubmit={(e) => {
              e.preventDefault();
              const message =
                request.trim() || 'Giúp tôi tìm sản phẩm phù hợp. Hãy hỏi nhu cầu và ngân sách của tôi trước.';
              agent.open();
              void agent.send(message);
              setRequest('');
            }}
          >
            <input
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-black outline-none"
              aria-label="Bạn muốn Agent giúp gì?"
              placeholder="Bạn đang tìm sản phẩm nào?"
              maxLength={3000}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
            <button
              className="shrink-0 rounded-xl bg-brand px-4 py-3 font-semibold text-brand-ink hover:bg-brand-hover"
              type="submit"
              disabled={agent.busy}
            >
              Hỏi Agent <span aria-hidden="true">↗</span>
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <button
              className="rounded-full border border-white/25 bg-white/10 px-3 py-2 hover:bg-white/20"
              onClick={() => agent.open('Giúp tôi tìm sản phẩm phù hợp dưới 1 triệu đồng.', false)}
            >
              Gợi ý dưới 1 triệu
            </button>
            <button
              className="rounded-full border border-white/25 bg-white/10 px-3 py-2 hover:bg-white/20"
              onClick={() =>
                agent.open(
                  'Tôi muốn so sánh và nghiên cứu chuyên sâu sản phẩm trong cửa hàng. Hãy hỏi nhu cầu của tôi trước.',
                  true,
                )
              }
            >
              Nghiên cứu & so sánh
            </button>
            <button
              className="rounded-full border border-white/25 bg-white/10 px-3 py-2 hover:bg-white/20"
              onClick={() => agent.open('Giúp tôi kiểm tra các đơn hàng gần đây.', false)}
            >
              Hỗ trợ đơn hàng
            </button>
          </div>
          <div className="mt-8 flex flex-wrap gap-6 text-sm">
            <Link href="/assistant" className="font-semibold text-brand hover:underline">
              Khám phá trợ lý Agent →
            </Link>
            <Link href="/shop" className="text-white/80 hover:text-white">
              Xem tất cả sản phẩm →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
