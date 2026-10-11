import { createHash } from 'crypto';
import { deflateSync } from 'zlib';
import Logger from '../../../../../shared/server/utils/logger';
import { hashPassword } from '../../../../../shared/server/utils/PasswordUtils';
import { failIfStrict } from './Seeder';
import { loadCatalogEntries, productTypeInfo, type CatalogEntry } from './ModelUniverseCatalog';
import UserModel from '../../internal/models/User.Model';
import CategoryModel from '../models/Category.Model';
import PartnerMediaModel from '../models/PartnerMedia.Model';
import type { PartnerApplication } from '../../../../../shared/types/partner';

// Synthetic marketplace sellers for development: applications in every review state, and listings that go through
// the real seller/moderation workflow (PartnerService, PartnerListingService), so versions, request digests and the
// immutable audit events are exactly what the app itself writes. Nothing is published: publication, guarantees and
// partner checkout stay behind the unapproved marketplace policy (business-requirements D3).

export const DEV_SELLER_PASSWORD = 'Seller@123';

type ListingOutcome = 'approved' | 'review' | 'draft' | 'rejected' | 'hidden';
type SellerOutcome = 'verified' | 'restricted' | 'submitted' | 'changes_requested' | 'rejected';

interface SeedSeller {
  email: string;
  firstName: string;
  lastName: string;
  outcome: SellerOutcome;
  application: PartnerApplication;
  limits?: { maxListings: number; maxListingValueVnd: number };
  review: string;
  listings: { catalogKey: string; outcome: ListingOutcome; stock: number; priceDelta: number; dispatchDays: number }[];
}

const bank = (bankName: string, bankAccount: string, accountHolder: string) => ({
  bankName,
  bankAccount,
  accountHolder,
});

const SELLERS: SeedSeller[] = [
  {
    email: 'seller1@example.com',
    firstName: 'Minh',
    lastName: 'Trần',
    outcome: 'verified',
    application: {
      legalName: 'Hộ kinh doanh Gundam Base Sài Gòn (demo)',
      displayName: 'Gundam Base Sài Gòn',
      phone: '0901 234 567',
      pickupAddress: '12 Nguyễn Thị Minh Khai, Quận 1, TP. Hồ Chí Minh',
      experience: 'Bán kit Motor Nuclear và Gunpla chính hãng từ 2019, có cửa hàng tại Quận 1.',
      ...bank('Vietcombank (demo)', 'DEMO 0071 0000 1111', 'TRAN MINH'),
    },
    limits: { maxListings: 20, maxListingValueVnd: 150_000_000 },
    review: 'Đã đối chiếu CCCD và chủ tài khoản ngân hàng (dữ liệu minh họa).',
    listings: [
      { catalogKey: 'mn-mnp-xh01-ban-thuong', outcome: 'approved', stock: 4, priceDelta: -3, dispatchDays: 1 },
      { catalogKey: 'mn-mnp-xh04-ban-thuong', outcome: 'approved', stock: 3, priceDelta: -2, dispatchDays: 1 },
      { catalogKey: 'mn-mnp-xh12-ban-thuong', outcome: 'approved', stock: 2, priceDelta: 0, dispatchDays: 2 },
      { catalogKey: 'mn-bv-xh01a-ban-a', outcome: 'approved', stock: 6, priceDelta: -5, dispatchDays: 1 },
      { catalogKey: 'mn-mnp-xh17-ban-thuong', outcome: 'review', stock: 2, priceDelta: 2, dispatchDays: 2 },
      { catalogKey: 'mn-mnp-xh16-ban-thuong', outcome: 'draft', stock: 1, priceDelta: 0, dispatchDays: 3 },
    ],
  },
  {
    email: 'seller2@example.com',
    firstName: 'Hà',
    lastName: 'Nguyễn',
    outcome: 'verified',
    application: {
      legalName: 'Công ty TNHH Mecha Corner Hà Nội (demo)',
      displayName: 'Mecha Corner Hà Nội',
      phone: '0912 345 678',
      pickupAddress: '45 Phố Huế, Hai Bà Trưng, Hà Nội',
      experience: 'Nhà phân phối figure hợp kim Cangdao và MOSHOW tại miền Bắc.',
      ...bank('Techcombank (demo)', 'DEMO 1903 0000 2222', 'CONG TY TNHH MECHA CORNER'),
    },
    limits: { maxListings: 15, maxListingValueVnd: 200_000_000 },
    review: 'Đã xác minh giấy phép kinh doanh và tài khoản doanh nghiệp (dữ liệu minh họa).',
    listings: [
      { catalogKey: 'cd-cd-08-ban-thuong', outcome: 'approved', stock: 2, priceDelta: -4, dispatchDays: 2 },
      { catalogKey: 'cd-cd-09-ban-thuong', outcome: 'approved', stock: 2, priceDelta: -4, dispatchDays: 2 },
      { catalogKey: 'cd-cd-10-ban-thuong', outcome: 'approved', stock: 1, priceDelta: 0, dispatchDays: 2 },
      { catalogKey: 'cd-cd-as-01-ban-thuong', outcome: 'rejected', stock: 5, priceDelta: 0, dispatchDays: 3 },
      { catalogKey: 'cd-cd-tg02-ban-thuong', outcome: 'hidden', stock: 3, priceDelta: 0, dispatchDays: 2 },
    ],
  },
  {
    email: 'seller3@example.com',
    firstName: 'Khoa',
    lastName: 'Lê',
    outcome: 'verified',
    application: {
      legalName: 'Lê Đăng Khoa (demo)',
      displayName: 'Kit Lab Đà Nẵng',
      phone: '0935 456 789',
      pickupAddress: '88 Lê Duẩn, Hải Châu, Đà Nẵng',
      experience: 'Chuyên kit SNAA, IN ERA+ và HEMOXIAN nhập trực tiếp.',
      ...bank('MB Bank (demo)', 'DEMO 0350 0000 3333', 'LE DANG KHOA'),
    },
    limits: { maxListings: 10, maxListingValueVnd: 80_000_000 },
    review: 'Đã đối chiếu CCCD và chủ tài khoản ngân hàng (dữ liệu minh họa).',
    listings: [
      { catalogKey: 'snaa-yr-02-ban-thuong', outcome: 'approved', stock: 3, priceDelta: -2, dispatchDays: 2 },
      { catalogKey: 'snaa-sc-004-aegis-knight', outcome: 'approved', stock: 5, priceDelta: 0, dispatchDays: 2 },
      { catalogKey: 'inera-tr-2243ex-ban-ex', outcome: 'approved', stock: 2, priceDelta: 3, dispatchDays: 3 },
      { catalogKey: 'hemoxian-nbd-009-set-version', outcome: 'review', stock: 2, priceDelta: 0, dispatchDays: 3 },
    ],
  },
  {
    email: 'seller4@example.com',
    firstName: 'Phúc',
    lastName: 'Võ',
    outcome: 'restricted',
    application: {
      legalName: 'Võ Hoàng Phúc (demo)',
      displayName: 'Hobby Nest Cần Thơ',
      phone: '0987 654 321',
      pickupAddress: '23 Trần Hưng Đạo, Ninh Kiều, Cần Thơ',
      experience: 'Sưu tầm figure MOSHOW, bán lại hàng mới nguyên hộp.',
      ...bank('ACB (demo)', 'DEMO 2468 0000 4444', 'VO HOANG PHUC'),
    },
    limits: { maxListings: 3, maxListingValueVnd: 30_000_000 },
    review: 'Giới hạn tạm thời: thời gian giao hàng thực tế chậm hơn cam kết (dữ liệu minh họa).',
    listings: [
      { catalogKey: 'moshow-mct-e01-ban-thuong', outcome: 'approved', stock: 1, priceDelta: 0, dispatchDays: 5 },
    ],
  },
  {
    email: 'seller5@example.com',
    firstName: 'Linh',
    lastName: 'Phạm',
    outcome: 'submitted',
    application: {
      legalName: 'Phạm Thùy Linh (demo)',
      displayName: 'Linh Model Shop',
      phone: '0977 111 222',
      pickupAddress: '5 Hùng Vương, TP. Huế',
      experience: 'Mới bắt đầu bán kit lắp ráp online.',
      ...bank('VPBank (demo)', 'DEMO 1357 0000 5555', 'PHAM THUY LINH'),
    },
    review: '',
    listings: [],
  },
  {
    email: 'seller6@example.com',
    firstName: 'Tuấn',
    lastName: 'Đỗ',
    outcome: 'changes_requested',
    application: {
      legalName: 'Đỗ Anh Tuấn (demo)',
      displayName: 'Tuấn Toys',
      phone: '0966 333 444',
      pickupAddress: '102 Lạch Tray, Ngô Quyền, Hải Phòng',
      experience: 'Bán đồ chơi và mô hình.',
      ...bank('BIDV (demo)', 'DEMO 9753 0000 6666', 'NGUYEN VAN AN'),
    },
    review:
      'Tên chủ tài khoản ngân hàng không khớp với giấy tờ tùy thân. Vui lòng cập nhật tài khoản đứng tên chính chủ.',
    listings: [],
  },
  {
    email: 'seller7@example.com',
    firstName: 'Quang',
    lastName: 'Bùi',
    outcome: 'rejected',
    application: {
      legalName: 'Bùi Quang (demo)',
      displayName: 'Replica World',
      phone: '0944 555 666',
      pickupAddress: '9 Nguyễn Trãi, Thanh Xuân, Hà Nội',
      experience: 'Bán mô hình giá rẻ nhập từ nhiều nguồn.',
      ...bank('Sacombank (demo)', 'DEMO 8642 0000 7777', 'BUI QUANG'),
    },
    review: 'Ảnh mẫu cho thấy hàng nhái (bootleg); sàn chỉ nhận hàng chính hãng.',
    listings: [],
  },
];

const MODERATION: Partial<Record<ListingOutcome, string>> = {
  approved: 'Ảnh khớp mẫu và phiên bản, mô tả tình trạng đầy đủ (dữ liệu minh họa).',
  rejected: 'Ảnh là ảnh quảng cáo của hãng; cần ảnh chụp thực tế hộp đang bán.',
};

// A small solid PNG standing in for a private identity photograph.
const placeholderPng = (seed: string): Buffer => {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const [r, g, b] = createHash('sha256').update(seed).digest();
  const width = 64,
    height = 40;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const roundTo10k = (amount: number) => Math.round(amount / 10_000) * 10_000;

export interface PartnerSeedResult {
  sellers: number;
  listings: number;
}

// Idempotent per seller e-mail: an existing seller account is left untouched.
export const seedPartnerData = async (): Promise<PartnerSeedResult> => {
  // Required lazily: the services import the database provider, which imports every model (including the one whose
  // seedData calls this).
  /* eslint-disable @typescript-eslint/no-var-requires */
  const PartnerService = require('../../../services/PartnerService').default;
  const PartnerListingService = require('../../../services/PartnerListingService').default;
  const EvidenceService = require('../../../services/EvidenceService').default;
  /* eslint-enable @typescript-eslint/no-var-requires */
  const partners = new PartnerService(),
    listings = new PartnerListingService(),
    evidence = new EvidenceService();

  const admin = await UserModel.findOne({ where: { role: 'ADMIN', isActive: true }, order: [['id', 'ASC']] });
  if (!admin) {
    Logger.WARN('No active admin account: marketplace sellers were not seeded (they need a reviewer).');
    return { sellers: 0, listings: 0 };
  }
  const catalog = new Map(loadCatalogEntries().map((entry) => [entry.id, entry]));
  const categoryIdBySlug = new Map((await CategoryModel.findAll()).map((category) => [category.slug, category.id]));
  const passwordHash = await hashPassword(DEV_SELLER_PASSWORD);
  let sellerCount = 0,
    listingCount = 0;

  for (const seller of SELLERS) {
    if (await UserModel.findOne({ where: { email: seller.email } })) continue;
    const user = await UserModel.create({
      email: seller.email,
      passwordHash,
      firstName: seller.firstName,
      lastName: seller.lastName,
      phone: seller.application.phone.replace(/\s/g, ''),
      address: seller.application.pickupAddress,
      role: 'USER',
      isActive: true,
    });
    const photos = [];
    for (const side of ['front', 'back']) {
      photos.push(
        await evidence.storeGenerated(
          user.id,
          'partner_verification',
          placeholderPng(`${seller.email}:${side}`),
          `cccd-${side}-demo.png`,
        ),
      );
    }
    let profile = await partners.submit(user.id, {
      requestKey: `seed-partner-${user.id}`,
      application: seller.application,
      termsAccepted: true,
      evidenceIds: photos.map((photo) => photo.id),
    });
    const review = (body: Record<string, unknown>) =>
      partners.act(profile.id, admin.id, { expectedVersion: profile.version, reason: seller.review, ...body }, true);
    if (seller.outcome === 'changes_requested') profile = await review({ action: 'request_changes' });
    if (seller.outcome === 'rejected') profile = await review({ action: 'reject' });
    if (seller.limits && ['verified', 'restricted'].includes(seller.outcome)) {
      profile = await review({ action: 'verify', identityVerified: true, bankVerified: true, ...seller.limits });
    }
    sellerCount++;

    for (const item of seller.listings) {
      const entry = catalog.get(item.catalogKey) as CatalogEntry | undefined;
      if (!entry?.sku) throw new Error(`Seed listing ${item.catalogKey} needs a catalog row with a manufacturer code`);
      const media = await PartnerMediaModel.create({
        ownerUserId: user.id,
        url: entry.image_url,
        originalName: `${entry.id}.jpg`,
        publicationConsentAt: new Date(),
        // The demo photo is a hot-linked reference image, so its digest is taken over the URL, not over file bytes.
        sha256: createHash('sha256').update(entry.image_url).digest('hex'),
      });
      const info = productTypeInfo(entry);
      const variant = entry.variant && entry.variant !== 'Bản thường' ? ` — ${entry.variant}` : '';
      const descriptionVi =
        `Hàng mới nguyên seal, ${info.vi.toLowerCase()}${entry.scale && entry.scale !== 'N/A' ? `, tỷ lệ ${entry.scale}` : ''}. ` +
        `Shop ${seller.application.displayName} giao trong ${item.dispatchDays} ngày làm việc. Tin đăng minh họa: ảnh là ảnh tham khảo, không phải ảnh hàng thật.`;
      let listing = await listings.create(user.id, {
        requestKey: `seed-listing-${user.id}-${entry.id}`,
        name: `${entry.brand} ${entry.sku} ${entry.name}${variant}`,
        brandName: entry.brand,
        description: descriptionVi,
        descriptionVi,
        descriptionEn: `Factory-sealed ${info.en.toLowerCase()}. Ships from ${seller.application.displayName} within ${item.dispatchDays} business days. Demo listing: the photo is a reference image, not the actual item.`,
        scale: entry.scale && entry.scale !== 'N/A' ? entry.scale : undefined,
        series: entry.series || undefined,
        modelCode: entry.sku,
        condition: 'new',
        assemblyState: info.assemblyState,
        boxCondition: 'Nguyên seal, hộp mới',
        includedAccessories: [],
        defects: [],
        price: roundTo10k(entry.price_vnd * (1 + item.priceDelta / 100)),
        stock: item.stock,
        categoryId: categoryIdBySlug.get(info.category),
        dispatchDays: item.dispatchDays,
        photoIds: [media.id],
        conditionConfirmed: true,
      });
      const step = async (actor: number, body: Record<string, unknown>, admin = false) => {
        listing = await listings.act(listing.id, actor, { expectedVersion: listing.listingVersion, ...body }, admin);
      };
      if (item.outcome === 'hidden') await step(user.id, { action: 'hide' });
      if (['review', 'approved', 'rejected'].includes(item.outcome)) await step(user.id, { action: 'submit' });
      if (item.outcome === 'approved' || item.outcome === 'rejected') {
        await step(
          admin.id,
          {
            action: item.outcome === 'approved' ? 'approve' : 'reject',
            reason: MODERATION[item.outcome],
            actualPhotosVerified: item.outcome === 'approved',
            descriptionVerified: item.outcome === 'approved',
          },
          true,
        );
      }
      listingCount++;
    }

    // Restricted after selling: existing listings stay, new ones are capped by the reviewed limits.
    if (seller.outcome === 'restricted' && seller.limits) await review({ action: 'restrict', ...seller.limits });
  }
  return { sellers: sellerCount, listings: listingCount };
};

export const seedPartnerDataSafely = async (): Promise<void> => {
  // DB tests start from an empty seller queue (tests/db/support/testDb.ts).
  if (process.env.SEED_PARTNERS === 'false') return;
  try {
    const { sellers, listings } = await seedPartnerData();
    Logger.INFO(
      `${sellers} marketplace sellers and ${listings} seller listings seeded (sellerN@example.com / ${DEV_SELLER_PASSWORD}).`,
    );
  } catch (error) {
    Logger.ERROR('Error seeding marketplace sellers:', error);
    failIfStrict(error);
  }
};
