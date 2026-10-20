'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import SaleShelf from '@/core/client/features/sales/SaleShelf';
import HomePromotions from '@/core/client/features/promotions/HomePromotions';
import AnnouncementTicker from '../components/AnnouncementTicker';
import ProductRail from '../components/ProductRail';
import Link from '@/i18n/navigation';
import type { ProductSummary } from '@/shared/types/product';
import { collectorServices } from '@/components/Services/ServiceExperience';
import AdminIcon from '@/components/Admin/AdminIcon';
import { readRecentlyViewed } from '@/shared/client/recentlyViewed';

const GRADES = [
  ['EG', 'Entry Grade'],
  ['HG', 'High Grade'],
  ['RG', 'Real Grade'],
  ['MG', 'Master Grade'],
  ['PG', 'Perfect Grade'],
  ['SD', 'Super Deformed'],
];

// The home page in the order a shopper decides: today's offers (ticker, banners, vouchers), the live sale, what others
// buy most, a quick way in by grade, what is new, good prices, what this visitor looked at, then the shop's services.
const Home = ({ initialProducts }: { initialProducts?: ProductSummary[] }) => {
  const t = useTranslations('home');
  const experience = useTranslations('experience');
  const en = useLocale() === 'en';
  const [recent, setRecent] = useState<ProductSummary[]>([]);
  useEffect(() => setRecent(readRecentlyViewed()), []);
  return (
    <>
      <AnnouncementTicker />
      <HomePromotions products={initialProducts} />
      <SaleShelf />
      <ProductRail
        ranked
        tone="hot"
        icon="bolt"
        title={en ? 'Best sellers' : 'Bán chạy nhất'}
        note={en ? 'What collectors buy most right now.' : 'Những mô hình được săn nhiều nhất lúc này.'}
        href="/cua-hang?sort=best_selling"
        query={{ sort: 'best_selling', inStock: true }}
      />
      <section className="mu-wrap home-grades">
        <h2>{t('gradeTitle')}</h2>
        <nav>
          {GRADES.map(([grade, name]) => (
            <Link href={`/cua-hang?grade=${grade}`} key={grade} className="home-grade">
              <strong>{grade}</strong>
              <small>{name}</small>
            </Link>
          ))}
        </nav>
      </section>
      <ProductRail
        tone="new"
        icon="star"
        title={en ? 'New arrivals' : 'Hàng mới về'}
        note={en ? 'Fresh on the shelves this week.' : 'Vừa lên kệ, xem trước khi hết.'}
        href="/cua-hang?sort=newest"
        query={{ sort: 'newest', inStock: true }}
      />
      <ProductRail
        tone="deal"
        icon="percent"
        title={en ? 'Great kits under 1,000,000 VND' : 'Giá tốt dưới 1 triệu'}
        note={en ? 'Easy first builds and gifts.' : 'Dễ bắt đầu, hợp làm quà.'}
        href="/cua-hang?maxPrice=1000000"
        query={{ maxPrice: 1_000_000, inStock: true, sort: 'best_selling' }}
      />
      {recent.length >= 2 && (
        <ProductRail
          icon="clock"
          title={en ? 'Recently viewed' : 'Bạn vừa xem'}
          note={en ? 'Pick up where you left off.' : 'Tiếp tục từ chỗ bạn dừng lại.'}
          products={recent}
        />
      )}
      <section className="mu-wrap mu-section studio-services-section">
        <div className="mu-section-head">
          <div>
            <p className="studio-kicker">{experience('beyondTheBox')}</p>
            <h2 className="mu-heading">{experience('servicesTitle')}</h2>
          </div>
          <Link href="/services" className="studio-text-link">
            {experience('allServices')} ↗
          </Link>
        </div>
        <div className="studio-service-grid">
          {collectorServices.slice(0, 3).map((service) => (
            <Link href={service.route} className={`studio-service-card service-${service.key}`} key={service.key}>
              <div className="studio-service-symbol">
                <AdminIcon name={service.icon} size={32} />
              </div>
              <h3>{experience(`serviceNames.${service.key}`)}</h3>
              <p>{experience(`serviceSummary.${service.key}`)}</p>
              <span className="studio-service-arrow">
                <AdminIcon name="arrow" size={20} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
};

export default Home;
