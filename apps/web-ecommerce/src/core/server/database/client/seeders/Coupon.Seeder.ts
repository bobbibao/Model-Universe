import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import CouponModel from '../models/Coupon.Model';
import { daysFromNow } from './SeedClock';

// One coupon per state the checkout has to handle: active, limited, expired, not started yet, used up, disabled,
// and one with a minimum order.
export const seedCouponData = async (): Promise<void> => {
  try {
    await CouponModel.bulkCreate([
      {
        code: 'WELCOME10',
        title: 'Chào mừng khách hàng mới',
        description: 'Giảm 10% cho mọi đơn hàng.',
        discountPercent: 10,
        usageLimit: null,
        startDate: daysFromNow(-365),
        expirationDate: daysFromNow(365),
      },
      {
        code: 'SALE20',
        title: 'Khuyến mãi mùa thu',
        description: 'Giảm 20% cho 100 đơn hàng đầu tiên.',
        discountPercent: 20,
        usageLimit: 100,
        startDate: daysFromNow(-30),
        expirationDate: daysFromNow(60),
      },
      {
        code: 'SUMMER15',
        title: 'Khuyến mãi mùa hè',
        description: 'Giảm 15% (đã hết hạn).',
        discountPercent: 15,
        usageLimit: 200,
        startDate: daysFromNow(-150),
        expirationDate: daysFromNow(-60),
      },
      {
        code: 'BLACKFRIDAY30',
        title: 'Black Friday',
        description: 'Giảm 30% trong dịp Black Friday.',
        discountPercent: 30,
        usageLimit: 500,
        startDate: daysFromNow(55),
        expirationDate: daysFromNow(60),
      },
      {
        code: 'VIP50',
        title: 'Ưu đãi khách hàng VIP',
        description: 'Giảm 50%, chỉ dành cho 1 đơn hàng.',
        discountPercent: 50,
        usageLimit: 1,
        usageCount: 1,
        startDate: daysFromNow(-10),
        expirationDate: daysFromNow(20),
      },
      {
        code: 'FREESHIP5',
        title: 'Ưu đãi tạm dừng',
        description: 'Giảm 5% (đang tạm dừng).',
        discountPercent: 5,
        usageLimit: null,
        startDate: daysFromNow(-10),
        expirationDate: daysFromNow(90),
        isActive: false,
      },
      {
        code: 'DON1TRIEU',
        title: 'Ưu đãi đơn lớn',
        description: 'Giảm 8% cho đơn hàng từ 1.000.000 ₫.',
        discountPercent: 8,
        usageLimit: null,
        minOrderVnd: 1_000_000,
        startDate: daysFromNow(-120),
        expirationDate: daysFromNow(120),
      },
    ]);
    Logger.INFO('7 coupons seeded.');
  } catch (error) {
    Logger.ERROR('Error seeding the coupon table:', error);
    failIfStrict(error);
  }
};
