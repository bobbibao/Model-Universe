import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import CouponModel from '../models/Coupon.Model';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

// One coupon per state the checkout has to handle: active, limited, expired, not started yet, used up, disabled.
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
    ]);
    Logger.INFO('6 coupons seeded.');
  } catch (error) {
    Logger.ERROR('Error seeding the coupon table:', error);
    failIfStrict(error);
  }
};
