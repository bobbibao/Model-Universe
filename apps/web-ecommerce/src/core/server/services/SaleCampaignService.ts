import crypto from 'crypto';
import { Op, fn, col, type Transaction } from 'sequelize';
import SaleCampaignModel from '../database/client/models/SaleCampaign.Model';
import ProductModel, { STOREFRONT_VISIBLE } from '../database/client/models/Product.Model';
import ProductDiscountModel from '../database/client/models/ProductDiscount.Model';
import StockImportItemModel from '../database/client/models/StockImportItem.Model';
import PromotionAuditModel from '../database/client/models/PromotionAudit.Model';
import ProductDiscountService, { toPricing } from './ProductDiscountService';
import PricingApprovalService from './PricingApprovalService';
import HttpError from '../../../shared/server/utils/HttpError';
import { safeSalePercent, weeklySalePercent, vietnamWeekStart } from '../../../shared/sale-pricing';

export interface WeeklySaleRule {
  enabled: boolean;
  minAgeDays: number;
  productLimit: number;
  maxPercent: number;
}
const DEFAULT_RULE: WeeklySaleRule = { enabled: false, minAgeDays: 60, productLimit: 12, maxPercent: 25 };
const DAY = 86400_000;
const whole = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw HttpError.badRequest('Thông số chương trình không hợp lệ.');
  return value;
};
const ref = (id: number) => `store-sale:${id}`;

export default class SaleCampaignService {
  private async products(transaction?: Transaction, ids?: number[]) {
    return ProductModel.findAll({
      where: {
        ...STOREFRONT_VISIBLE,
        partnerId: null,
        stock: { [Op.gt]: 0 },
        ...(ids ? { id: { [Op.in]: ids } } : {}),
      },
      order: [['id', 'ASC']],
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }

  private async ages(products: ProductModel[], now: Date, transaction?: Transaction) {
    if (!products.length) return new Map<number, number>();
    const receipts = (await StockImportItemModel.findAll({
      attributes: ['productId', [fn('MAX', col('createdAt')), 'lastReceived']],
      where: { productId: { [Op.in]: products.map((p) => p.id) } },
      group: ['productId'],
      raw: true,
      transaction,
    })) as unknown as { productId: number; lastReceived: string }[];
    const latest = new Map(receipts.map((r) => [r.productId, new Date(r.lastReceived)]));
    return new Map(
      products.map((p) => [
        p.id,
        Math.max(
          0,
          Math.floor((now.getTime() - (latest.get(p.id) || p.productionDate || p.createdAt).getTime()) / DAY),
        ),
      ]),
    );
  }

  async candidates(now = new Date()) {
    const products = await this.products();
    const ages = await this.ages(products, now);
    const active = await new ProductDiscountService().getActive(
      products.map((p) => p.id),
      { now },
    );
    const costs = await new PricingApprovalService().unitCosts(products);
    const cost = (p: ProductModel) => costs.get(p.id) ?? p.importPrice;
    return products
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        price: p.price,
        costVnd: cost(p),
        stock: p.stock,
        grade: p.grade,
        ageDays: ages.get(p.id)!,
        currentDiscount: active.get(p.id)?.percent || 0,
        maximumSafePercent:
          Array.from({ length: 25 }, (_, i) => 25 - i).find((percent) =>
            safeSalePercent(p.price, cost(p), percent),
          ) || 0,
      }))
      .sort((a, b) => b.ageDays - a.ageDays || a.id - b.id);
  }

  async admin() {
    const campaigns = await SaleCampaignModel.findAll({
      where: { kind: { [Op.ne]: 'weekly_rule' } },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    const rule = await SaleCampaignModel.findOne({ where: { key: 'weekly-rule' } });
    return { campaigns, weeklyRule: rule?.settings || DEFAULT_RULE };
  }

  async saveRule(input: Record<string, unknown>, actorUserId: number) {
    if (typeof input.enabled !== 'boolean') throw HttpError.badRequest('Cần chọn trạng thái tự động.');
    const settings: WeeklySaleRule = {
      enabled: input.enabled,
      minAgeDays: whole(input.minAgeDays, 30, 730),
      productLimit: whole(input.productLimit, 1, 100),
      maxPercent: whole(input.maxPercent, 11, 25),
    };
    await SaleCampaignModel.sequelize!.transaction(async (transaction) => {
      await SaleCampaignModel.sequelize!.query('SELECT pg_advisory_xact_lock(836205)', { transaction });
      const row = await SaleCampaignModel.findOne({ where: { key: 'weekly-rule' }, transaction });
      const oldValue = row?.settings || null;
      const saved = row
        ? await row.update({ settings: { ...settings } }, { transaction })
        : await SaleCampaignModel.create(
            {
              key: 'weekly-rule',
              kind: 'weekly_rule',
              title: 'Weekly inventory sale rule',
              startsAt: new Date(),
              settings,
              createdByUserId: actorUserId,
            },
            { transaction },
          );
      await PromotionAuditModel.create(
        {
          actorUserId,
          entityType: 'sale_campaign',
          entityId: saved.id,
          action: 'weekly_rule',
          oldValue,
          newValue: settings,
        },
        { transaction },
      );
    });
    return settings;
  }

  async create(input: Record<string, unknown>, actorUserId: number) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const percent = whole(input.percent, 1, 25);
    const startsAt = new Date(String(input.startsAt)),
      endsAt = new Date(String(input.endsAt));
    const ids = Array.isArray(input.productIds) ? [...new Set(input.productIds)] : [];
    if (
      !title ||
      title.length > 120 ||
      description.length > 1000 ||
      !ids.length ||
      ids.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0)
    )
      throw HttpError.badRequest('Chọn sản phẩm và nhập tên sự kiện tối đa 120 ký tự.');
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt ||
      endsAt.getTime() <= Date.now() ||
      endsAt.getTime() - startsAt.getTime() > 90 * DAY
    )
      throw HttpError.badRequest('Sự kiện cần thời gian hợp lệ, kết thúc trong tương lai và kéo dài tối đa 90 ngày.');
    if (typeof input.requestKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestKey))
      throw HttpError.badRequest('Thiếu mã yêu cầu. Vui lòng tải lại trang.');
    const digest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          title,
          description,
          percent,
          startsAt,
          endsAt,
          ids: ids.sort((a, b) => Number(a) - Number(b)),
        }),
      )
      .digest('hex');
    return SaleCampaignModel.sequelize!.transaction(async (transaction) => {
      await SaleCampaignModel.sequelize!.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: input.requestKey },
        transaction,
      });
      const existing = await SaleCampaignModel.findOne({ where: { key: input.requestKey }, transaction });
      if (existing) {
        if (existing.settings.digest !== digest) throw HttpError.conflict('Yêu cầu đã được sử dụng cho nội dung khác.');
        return existing;
      }
      const products = await this.products(transaction, ids as number[]);
      if (products.length !== ids.length)
        throw HttpError.conflict('Một số sản phẩm không còn khả dụng hoặc thuộc đối tác. Vui lòng tải lại.');
      const costs = await new PricingApprovalService().unitCosts(products, transaction);
      const cost = (p: ProductModel) => costs.get(p.id) ?? p.importPrice;
      const invalid = products.filter((p) => !safeSalePercent(p.price, cost(p), percent));
      if (invalid.length)
        throw HttpError.conflict(
          `Mức giảm vượt sàn lợi nhuận hoặc thiếu giá vốn: ${invalid
            .map((p) => p.sku)
            .slice(0, 8)
            .join(', ')}. Hãy chọn mức thấp hơn.`,
        );
      const campaign = await SaleCampaignModel.create(
        {
          key: input.requestKey,
          title,
          description,
          kind: 'manual',
          startsAt,
          endsAt,
          createdByUserId: actorUserId,
          settings: {
            digest,
            products: products.map((p) => ({ id: p.id, sku: p.sku, percent, price: p.price, costVnd: cost(p) })),
          },
        },
        { transaction },
      );
      await ProductDiscountModel.bulkCreate(
        products.map((p) => ({ productId: p.id, percent, startsAt, endsAt, campaignRef: ref(campaign.id) })),
        { transaction },
      );
      await PromotionAuditModel.create(
        {
          actorUserId,
          entityType: 'sale_campaign',
          entityId: campaign.id,
          action: 'create',
          newValue: campaign.get({ plain: true }),
        },
        { transaction },
      );
      return campaign;
    });
  }

  async cancel(id: number, actorUserId: number) {
    return SaleCampaignModel.sequelize!.transaction(async (transaction) => {
      const campaign = await SaleCampaignModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!campaign || campaign.kind === 'weekly_rule') throw HttpError.notFound();
      if (campaign.revokedAt) return campaign;
      const now = new Date();
      await campaign.update({ revokedAt: now }, { transaction });
      await ProductDiscountModel.update(
        { revokedAt: now },
        { where: { campaignRef: ref(id), revokedAt: null }, transaction },
      );
      await PromotionAuditModel.create(
        { actorUserId, entityType: 'sale_campaign', entityId: id, action: 'cancel', newValue: { revokedAt: now } },
        { transaction },
      );
      return campaign;
    });
  }

  async runWeekly(now = new Date()) {
    return SaleCampaignModel.sequelize!.transaction(async (transaction) => {
      await SaleCampaignModel.sequelize!.query('SELECT pg_advisory_xact_lock(836205)', { transaction });
      const ruleRow = await SaleCampaignModel.findOne({ where: { key: 'weekly-rule' }, transaction });
      const rule = ruleRow?.settings as unknown as WeeklySaleRule | undefined;
      if (!rule?.enabled) return null;
      const start = vietnamWeekStart(now),
        endsAt = new Date(start.getTime() + 7 * DAY);
      const key = `weekly:${start.toISOString()}`;
      const existing = await SaleCampaignModel.findOne({ where: { key }, transaction });
      if (existing) return existing;
      const products = await this.products(transaction);
      const ages = await this.ages(products, now, transaction);
      const active = await new ProductDiscountService().getActive(
        products.map((p) => p.id),
        { transaction, now },
      );
      const costs = await new PricingApprovalService().unitCosts(products, transaction);
      const cost = (p: ProductModel) => costs.get(p.id) ?? p.importPrice;
      const selected = products
        .map((p) => ({
          p,
          age: ages.get(p.id)!,
          percent: weeklySalePercent(p.price, cost(p), ages.get(p.id)!, rule.maxPercent),
        }))
        .filter(({ p, age, percent }) => age >= rule.minAgeDays && percent > 10 && !active.has(p.id))
        .sort((a, b) => b.age - a.age || b.p.stock - a.p.stock || a.p.id - b.p.id)
        .slice(0, rule.productLimit);
      // Record empty runs too: enabling / restarting workers must not rerun a week or reset its campaign.
      const campaign = await SaleCampaignModel.create(
        {
          key,
          kind: 'weekly',
          title: `Ưu đãi tuần ${new Date(start.getTime() + 7 * 3600_000).toISOString().slice(0, 10)}`,
          description: 'Mô hình tuyển chọn mỗi tuần. Số lượng theo tồn kho thực tế.',
          startsAt: now,
          endsAt,
          createdByUserId: ruleRow!.createdByUserId,
          settings: {
            rule,
            products: selected.map(({ p, percent, age }) => ({
              id: p.id,
              sku: p.sku,
              percent,
              ageDays: age,
              price: p.price,
              costVnd: cost(p),
            })),
          },
        },
        { transaction },
      );
      await ProductDiscountModel.bulkCreate(
        selected.map(({ p, percent }) => ({
          productId: p.id,
          percent,
          startsAt: now,
          endsAt,
          campaignRef: ref(campaign.id),
        })),
        { transaction },
      );
      await PromotionAuditModel.create(
        {
          actorUserId: null,
          entityType: 'sale_campaign',
          entityId: campaign.id,
          action: 'weekly_run',
          newValue: campaign.get({ plain: true }),
        },
        { transaction },
      );
      return campaign;
    });
  }

  async storefront(now = new Date()) {
    const events = await SaleCampaignModel.findAll({
      where: {
        kind: { [Op.ne]: 'weekly_rule' },
        revokedAt: null,
        startsAt: { [Op.lte]: now },
        endsAt: { [Op.gt]: now },
      },
      order: [['startsAt', 'DESC']],
    });
    const result = [];
    for (const event of events) {
      const rows = await ProductDiscountModel.findAll({
        where: { campaignRef: ref(event.id), revokedAt: null, startsAt: { [Op.lte]: now }, endsAt: { [Op.gt]: now } },
      });
      const products = await ProductModel.findAll({
        attributes: [
          'id',
          'uuid',
          'slug',
          'name',
          'sku',
          'brandName',
          'price',
          'imageUrl',
          'stock',
          'grade',
          'scale',
          'condition',
          'salesChannel',
          'rating',
          'reviewCount',
          'isFeatured',
        ],
        where: {
          ...STOREFRONT_VISIBLE,
          partnerId: null,
          stock: { [Op.gt]: 0 },
          id: { [Op.in]: rows.map((r) => r.productId) },
        },
      });
      const active = await new ProductDiscountService().getActive(
        products.map((p) => p.id),
        { now },
      );
      const priced = products
        .map((p) => ({ ...p.get({ plain: true }), ...toPricing(p.price, active.get(p.id)) }))
        .filter((p) => p.discountPercent > 0 && p.saleEventId === event.id);
      if (priced.length)
        result.push({
          id: event.id,
          title: event.title,
          description: event.description,
          kind: event.kind,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          maximumPercent: Math.max(...priced.map((p) => p.discountPercent)),
          products: priced.sort((a, b) => b.discountPercent - a.discountPercent),
        });
    }
    return { events: result };
  }
}
