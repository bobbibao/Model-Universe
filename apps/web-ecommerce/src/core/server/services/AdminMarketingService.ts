import { randomUUID } from 'crypto';
import { Op, type Transaction } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import AdminMarketingModel from '../database/client/models/AdminMarketing.Model';
import MarketingCampaignModel from '../database/client/models/MarketingCampaign.Model';
import MarketingPostModel from '../database/client/models/MarketingPost.Model';
import MarketingAssetModel from '../database/client/models/MarketingAsset.Model';
import AdCampaignModel from '../database/client/models/AdCampaign.Model';
import ProductModel, { STOREFRONT_VISIBLE } from '../database/client/models/Product.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import type { AuthUser } from '../../../shared/server/types/express';
import type { MarketingCopy, MarketingDraftInput, MarketingOptions } from '../../../shared/types/admin-marketing';
import AgentGatewayService from './AgentGatewayService';
import AgentPolicyService from './agent/AgentPolicyService';
import MarketingCampaignService from './MarketingCampaignService';
import { createPost, createAd, activateAd, revertPost } from './agent/MarketingActions';
import type { AdBody, PostBody } from './agent/AgentLimits';
import { platformMode } from './marketing/platforms';
import { parseDraft, publishBody } from './marketing/AdminMarketingValidation';

export default class AdminMarketingService {
  private assertAdmin(user: AuthUser) {
    if (user.role !== 'ADMIN') throw HttpError.forbidden();
  }

  async options(): Promise<MarketingOptions> {
    const [assets, products] = await Promise.all([
      MarketingAssetModel.findAll({ attributes: ['id', 'title', 'kind', 'url'], order: [['id', 'DESC']], limit: 200 }),
      ProductModel.findAll({ where: STOREFRONT_VISIBLE, attributes: ['sku', 'name'], order: [['name', 'ASC']] }),
    ]);
    return {
      assets: assets.map((a) => ({ id: a.id, title: a.title, kind: a.kind, url: a.url })),
      products: products.map((p) => ({ sku: p.sku, name: p.name })),
      modes: {
        facebook: platformMode('facebook'),
        meta: platformMode('meta'),
        google: platformMode('google'),
        tiktok: platformMode('tiktok'),
      },
    };
  }

  async list() {
    const drafts = await AdminMarketingModel.findAll({ order: [['id', 'DESC']], limit: 100 });
    const refs = drafts.map((d) => d.ref);
    const [campaigns, ads, posts] = await Promise.all([
      MarketingCampaignModel.findAll({ where: { ref: { [Op.in]: refs } } }),
      AdCampaignModel.findAll({ where: { campaignRef: { [Op.in]: refs } } }),
      MarketingPostModel.findAll({ where: { campaignRef: { [Op.in]: refs } } }),
    ]);
    return drafts.map((d) => ({
      ...d.toJSON(),
      campaignStatus: campaigns.find((c) => c.ref === d.ref)?.status,
      adStatus: ads.find((a) => a.campaignRef === d.ref)?.status,
      postStatus: posts.find((p) => p.campaignRef === d.ref)?.status,
      externalId:
        ads.find((a) => a.campaignRef === d.ref)?.externalId ??
        posts.find((p) => p.campaignRef === d.ref)?.externalId ??
        null,
    }));
  }

  async save(user: AuthUser, raw: unknown, id?: number) {
    this.assertAdmin(user);
    const input = parseDraft(raw);
    if (!id) return AdminMarketingModel.create({ ref: `adm-${randomUUID()}`, createdBy: user.id, input });
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      const draft = await this.lock(id, transaction);
      if (draft.status !== 'draft') throw HttpError.conflict('Chiến dịch đã gửi, hãy tạo bản nháp mới.');
      return draft.update({ input }, { transaction });
    });
  }

  private async lock(id: number, transaction: Transaction) {
    const draft = await AdminMarketingModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!draft) throw HttpError.notFound('Không tìm thấy bản nháp.');
    return draft;
  }

  async suggest(user: AuthUser, raw: unknown, locale: 'vi' | 'en' = 'vi'): Promise<MarketingCopy> {
    this.assertAdmin(user);
    const input = parseDraft(raw);
    if (!input.brief) throw HttpError.badRequest('Nhập yêu cầu nội dung để Agent gợi ý.');
    const product = input.sku ? await ProductModel.findOne({ where: { sku: input.sku, ...STOREFRONT_VISIBLE } }) : null;
    if (input.sku && !product) throw HttpError.notFound('Sản phẩm không còn được bán.');
    const facts = product
      ? JSON.stringify({
          name: product.name,
          sku: product.sku,
          priceVnd: product.price,
          brand: product.brandName,
          description: product.description?.slice(0, 1500),
          stock: product.stock,
        })
      : 'No verified product facts or promotions supplied.';
    const gateway = new AgentGatewayService();
    const thread = await gateway.forward(user, 'POST', '/threads', { body: { metadata: { graph: 'marketing_copy' } } });
    const threadId = (thread.data as { thread_id?: string })?.thread_id;
    if (thread.status >= 300 || !threadId) throw new HttpError(503, 'Chưa tạo được phiên gợi ý của Agent.');
    const result = await gateway.forward(user, 'POST', `/threads/${threadId}/runs/wait`, {
      body: {
        assistant_id: 'marketing_copy',
        input: {
          request: { locale, channel: input.channel, brief: input.brief, audience: input.audience, tone: input.tone, facts },
        },
      },
    });
    if (result.status >= 300)
      throw new HttpError(503, 'Agent chưa gợi ý được nội dung. Hãy kiểm tra dịch vụ Agent hoặc tự nhập nội dung.');
    const copy = (result.data as { copy?: Record<string, unknown> })?.copy;
    if (!copy) throw new HttpError(502, 'Agent chưa trả về nội dung hợp lệ.');
    const checked = parseDraft({
      ...input,
      message: copy.message ?? '',
      headline: copy.headline ?? '',
      primaryText: copy.primary_text ?? '',
      headlines: copy.headlines ?? [],
      descriptions: copy.descriptions ?? [],
      keywords: copy.keywords ?? [],
      adText: copy.ad_text ?? '',
    });
    return {
      message: checked.message,
      headline: checked.headline,
      primaryText: checked.primaryText,
      headlines: checked.headlines,
      descriptions: checked.descriptions,
      keywords: checked.keywords,
      adText: checked.adText,
    };
  }

  private async validateMedia(input: MarketingDraftInput, transaction: Transaction) {
    if (input.sku) {
      const product = await ProductModel.findOne({ where: { sku: input.sku, ...STOREFRONT_VISIBLE }, transaction });
      if (!product) throw HttpError.notFound('Sản phẩm không còn được bán.');
    }
    if (input.assetId) {
      const asset = await MarketingAssetModel.findByPk(input.assetId, { transaction });
      if (!asset || asset.kind !== (input.channel === 'tiktok' ? 'video' : 'image'))
        throw HttpError.badRequest('Cần chọn ảnh cho Facebook/Meta hoặc video cho TikTok.');
    }
  }

  async publish(user: AuthUser, id: number) {
    this.assertAdmin(user);
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await new AgentPolicyService().serialize(transaction);
      const draft = await this.lock(id, transaction);
      // A retry after a successful send never creates another platform post/ad.
      if (draft.status === 'submitted') return draft;
      const input = draft.input;
      const now = new Date();
      const body = publishBody(input, draft.ref, now);
      await this.validateMedia(input, transaction);
      const start = input.channel === 'facebook' ? input.scheduledAt : input.startsAt;
      await MarketingCampaignModel.create(
        {
          ref: draft.ref,
          name: input.name,
          kind: input.channel === 'facebook' ? 'content' : 'ads',
          channels: [input.channel === 'facebook' ? 'facebook_post' : `ads_${input.channel}`],
          objective: input.objective === 'conversions' ? 'sales' : 'traffic',
          status: input.channel === 'facebook' ? 'active' : 'paused',
          startsAt: start ? new Date(start) : now,
          endsAt: new Date((start ? new Date(start).getTime() : now.getTime()) + input.durationDays * 86400_000),
          budgetVnd: input.channel === 'facebook' ? 0 : input.dailyBudgetVnd * input.durationDays,
          utmCampaign: draft.ref,
          agentActionId: null,
        },
        { transaction },
      );
      const context = { path: {}, transaction, actionId: null, now, dryRun: false, decision: null };
      if (input.channel === 'facebook') await createPost({ ...context, body: body as PostBody });
      else await createAd({ ...context, body: body as AdBody });
      return draft.update({ status: 'submitted' }, { transaction });
    });
  }

  async control(user: AuthUser, id: number, action: 'activate' | 'pause' | 'end') {
    this.assertAdmin(user);
    const draft = await AdminMarketingModel.findByPk(id);
    if (!draft || draft.status !== 'submitted') throw HttpError.notFound('Không tìm thấy chiến dịch đã gửi.');
    if (action === 'end') {
      if (draft.input.channel !== 'facebook') return new MarketingCampaignService().endCampaign(draft.ref, user.id);
      return DatabaseProvider.getInstance().transaction(async (transaction) => {
        await new AgentPolicyService().serialize(transaction);
        const campaign = await MarketingCampaignModel.findOne({
          where: { ref: draft.ref },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const post = await MarketingPostModel.findOne({
          where: { campaignRef: draft.ref },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!campaign) throw HttpError.notFound('Không tìm thấy chiến dịch.');
        const now = new Date();
        if (post?.status === 'scheduled' && post.scheduledAt && post.scheduledAt > now)
          await revertPost(post.ref, transaction, now);
        await campaign.update({ status: 'ended' }, { transaction });
        return 'Chiến dịch đã kết thúc; bài chưa đến giờ đăng được hủy, bài đã đăng được giữ lại.';
      });
    }
    if (draft.input.channel === 'facebook') throw HttpError.badRequest('Bài post không phải quảng cáo.');
    if (action === 'pause') return new MarketingCampaignService().pauseAd(`${draft.ref}-ad`, user.id);
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      await new AgentPolicyService().serialize(transaction);
      const campaign = await MarketingCampaignModel.findOne({
        where: { ref: draft.ref },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const ad = await AdCampaignModel.findOne({
        where: { ref: `${draft.ref}-ad` },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        !campaign ||
        !ad ||
        ['ended', 'reverted'].includes(campaign.status) ||
        ['ended', 'reverted'].includes(ad.status)
      )
        throw HttpError.conflict('Chiến dịch đã kết thúc.');
      if (!ad.endsAt || ad.endsAt <= new Date()) throw HttpError.conflict('Quảng cáo đã hết thời gian chạy.');
      await activateAd({
        body: {},
        path: { ref: ad.ref },
        transaction,
        actionId: null,
        now: new Date(),
        dryRun: false,
        decision: null,
      });
      await campaign.update({ status: 'active' }, { transaction });
      return 'Quảng cáo đã bật chạy.';
    });
  }
}
