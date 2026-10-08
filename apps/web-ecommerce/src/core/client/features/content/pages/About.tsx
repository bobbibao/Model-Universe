import Link from '@/i18n/navigation';

const About = () => (
  <div className="mx-auto max-w-2xl px-4 py-20 text-center">
    <h1 className="mb-8 text-4xl font-bold md:text-6xl">Chúng tôi yêu khách hàng!</h1>
    <p className="text-lg text-body dark:text-store-muted">
      Chúng tôi luôn cố gắng mang đến cho khách hàng những sản phẩm tốt nhất, giá cả hợp lý nhất và dịch vụ chăm sóc
      khách hàng tốt nhất. Rất vui được phục vụ quý khách hàng!
    </p>
    <Link
      href="/contact"
      className="mt-8 inline-block rounded-md bg-brand px-10 py-3 font-semibold text-brand-ink hover:bg-brand-hover"
    >
      Liên hệ với chúng tôi
    </Link>
  </div>
);

export default About;
