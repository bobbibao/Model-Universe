'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import Link from '@/i18n/navigation';
import Api from '@/core/client/api/Api';
import ProductCard from '@/core/client/features/shop/components/ProductCard';
import type { ProductSummary } from '@/shared/types/product';
import './sales.css';

interface SaleEvent {
  id: number;
  title: string;
  description: string;
  endsAt: string;
  maximumPercent: number;
  products: ProductSummary[];
}
export default function SaleShelf({ full = false }: { full?: boolean }) {
  const en = useLocale() === 'en';
  const [events, setEvents] = useState<SaleEvent[]>([]);
  const [selected, setSelected] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    Api.get('/sales')
      .then(({ data }) => {
        if (!active) return;
        setEvents(data.events || []);
        const id = Number(new URLSearchParams(window.location.search).get('event'));
        setSelected(
          Math.max(
            0,
            (data.events || []).findIndex((e: SaleEvent) => e.id === id),
          ),
        );
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const event = events[selected];
  const remaining = event ? Math.max(0, new Date(event.endsAt).getTime() - now) : 0;
  const days = Math.floor(remaining / 86400_000),
    hours = Math.floor((remaining % 86400_000) / 3600_000),
    minutes = Math.floor((remaining % 3600_000) / 60_000);
  // Without a running sale the shelf has nothing to show; the offers page already explains member benefits.
  if (loading || failed || !event || !remaining) return null;
  return (
    <section className="sale-zone mu-wrap mu-section" aria-label={en ? 'Sale events' : 'Sự kiện ưu đãi'}>
      <div className="sale-hero">
        <div className="sale-hero-copy">
          <span className="sale-kicker">
            <span className="sale-live-dot" /> MODEL UNIVERSE / SPECIAL PICKS
          </span>
          <h2>{event && remaining ? event.title : en ? 'A new reason to build.' : 'Thêm lý do để bắt đầu build.'}</h2>
          <p>
            {event && remaining
              ? event.description
              : en
                ? 'Explore our collection and member offers. New sale events will appear here.'
                : 'Khám phá bộ sưu tập và quyền lợi thành viên. Sự kiện sale mới sẽ xuất hiện tại đây.'}
          </p>
          {event && remaining > 0 && (
            <div className="sale-time" aria-label={en ? 'Time remaining' : 'Thời gian còn lại'}>
              <span>{en ? 'Ends in' : 'Kết thúc sau'}</span>
              <strong>
                {days}
                {en ? 'd' : ' ngày'}
              </strong>
              <strong>
                {hours}
                {en ? 'h' : ' giờ'}
              </strong>
              <strong>
                {minutes}
                {en ? 'm' : ' phút'}
              </strong>
            </div>
          )}
          <div className="sale-hero-links">
            <Link href="/cua-hang">{en ? 'Explore all models' : 'Khám phá tất cả mô hình'} ↗</Link>
            {!full && <Link href={`/uu-dai?event=${event?.id || ''}`}>{en ? 'All offers' : 'Xem ưu đãi'} →</Link>}
          </div>
        </div>
        <div className="sale-hero-mark" aria-label={en ? 'Maximum discount' : 'Mức ưu đãi cao nhất'}>
          <span>
            {event && remaining ? (en ? 'SAVE UP TO' : 'GIẢM ĐẾN') : en ? 'MEMBER OFFER' : 'ƯU ĐÃI THÀNH VIÊN'}
          </span>
          <strong>
            {event && remaining ? event.maximumPercent : 10}
            <small>%</small>
          </strong>
          <span>
            {event && remaining
              ? en
                ? 'Selected models · real stock'
                : 'Mô hình tuyển chọn · Tồn kho thực'
              : en
                ? 'With an eligible member code'
                : 'Khi có mã thành viên hợp lệ'}
          </span>
        </div>
      </div>
      {events.length > 1 && (
        <div className="sale-tabs" aria-label={en ? 'Choose an event' : 'Chọn sự kiện'}>
          {events.map((e, i) => (
            <button type="button" aria-pressed={i === selected} key={e.id} onClick={() => setSelected(i)}>
              {e.title}
              <span>{e.products.length}</span>
            </button>
          ))}
        </div>
      )}
      {full && loading && (
        <p role="status" className="sale-message">
          {en ? 'Loading offers…' : 'Đang tải ưu đãi…'}
        </p>
      )}
      {full && failed && (
        <div role="alert" className="sale-message">
          <p>{en ? 'Offers could not be loaded.' : 'Chưa thể tải ưu đãi.'}</p>
          <button type="button" onClick={() => setRetry(retry + 1)}>
            {en ? 'Try again' : 'Thử lại'}
          </button>
        </div>
      )}
      {event && remaining > 0 && (
        <>
          <div className="sale-section-label">
            <h3>{en ? 'Your next favourite, for less' : 'Chốt kit yêu thích, giá tốt hơn'}</h3>
            <span>
              {event.products.length} {en ? 'models on offer' : 'mô hình đang ưu đãi'}
            </span>
          </div>
          <div className="sale-products">
            {event.products.slice(0, full ? undefined : 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}
      <div className="sale-member-strip">
        <span className="sale-member-icon">
          10<span>%</span>
        </span>
        <div>
          <strong>{en ? 'Your member benefit, separately' : 'Thêm quyền lợi cho thành viên'}</strong>
          <p>
            {en
              ? 'A valid 10% member code may combine with sale items when its terms allow. Check the final saving in your cart.'
              : 'Mã thành viên 10% hợp lệ có thể áp dụng cùng giá sale khi đáp ứng điều kiện. Kiểm tra ưu đãi cuối cùng tại giỏ hàng.'}
          </p>
        </div>
        <Link href="/services/loyalty">{en ? 'Member benefits' : 'Quyền lợi thành viên'} ↗</Link>
      </div>
    </section>
  );
}
