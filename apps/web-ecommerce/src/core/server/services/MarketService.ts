import { Op, Transaction } from 'sequelize';
import { parse } from 'csv-parse/sync';
import MarketCompetitorModel from '../database/client/models/MarketCompetitor.Model';
import MarketCompetitorPriceModel, { MarketDataSource } from '../database/client/models/MarketCompetitorPrice.Model';
import MarketCompetitorCampaignModel from '../database/client/models/MarketCompetitorCampaign.Model';
import MarketTrendPointModel from '../database/client/models/MarketTrendPoint.Model';
import MarketEventModel from '../database/client/models/MarketEvent.Model';
import MarketSourceModel, { MarketSourceStatus } from '../database/client/models/MarketSource.Model';
import ProductModel from '../database/client/models/Product.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, isHttpUrl, toInteger } from '../../../shared/server/utils/ValidationUtils';

// Market data for the growth agent (docs/GROWTH_AGENT.md section 2): competitors and their prices and campaigns,
// entered on /admin/agent/market (by hand or from the CSV template), and what the agent's collectors report through
// the Agent API (`POST /market/observations`: trends, competitor-site prices, source health).

export const CSV_COLUMNS = ['competitor', 'sku', 'url', 'title', 'price_vnd', 'observed_at'] as const;
export const CSV_TEMPLATE = `${CSV_COLUMNS.join(',')}\nThời Trang ABC,SKU123,https://abc.example/san-pham/1,Giày chạy bộ,1250000,2026-09-30\n`;

const MAX_CSV_ROWS = 1000;
const MAX_TITLE = 200;
const MAX_PRICE_VND = 1_000_000_000;
const PRICE_PAGE = 200;
const OBSERVATION_LIMITS = { trends: 500, competitor_prices: 500, competitor_campaigns: 100 };
const COLLECTOR_SOURCES: Record<string, MarketDataSource> = {
  competitor_sites: 'scraper',
  fixture: 'fixture',
};
const SOURCE_NAMES = ['trends', 'competitor_sites', 'fixture'];
const SOURCE_STATUSES: MarketSourceStatus[] = ['ok', 'degraded', 'blocked', 'off'];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};

// "1.250.000", "1,250,000 ₫" and "1250000" are the same price.
export const parseVnd = (raw: unknown): number | undefined => {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : undefined;
  const digits = asTrimmedString(raw).replace(/[\s.,₫đ]|VND/gi, '');
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
};

const parseDate = (raw: unknown): Date | undefined => {
  const text = asTrimmedString(raw);
  if (!text) return undefined;
  const date = new Date(DATE_ONLY.test(text) ? `${text}T12:00:00+07:00` : text);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

interface PriceInput {
  competitor: MarketCompetitorModel;
  product: ProductModel | null;
  url: string | null;
  title: string | null;
  priceVnd: number;
  observedAt: Date;
  watch: boolean;
}

export default class MarketService {
  // ------------------------------------------------------------------ competitors

  async listCompetitors(): Promise<MarketCompetitorModel[]> {
    return MarketCompetitorModel.findAll({ order: [['name', 'ASC']] });
  }

  private validateCompetitor(data: Record<string, unknown>) {
    const name = asTrimmedString(data.name);
    const website = asTrimmedString(data.website);
    const errors: string[] = [];
    if (name.length < 2 || name.length > 100) errors.push('Tên đối thủ phải dài 2-100 ký tự.');
    if (website && !isHttpUrl(website)) errors.push('Website phải là địa chỉ http(s).');
    if (errors.length > 0) throw HttpError.badRequest('Thông tin đối thủ chưa hợp lệ.', errors);
    return {
      name,
      website: website || null,
      notes: asTrimmedString(data.notes) || null,
      isActive: data.isActive === undefined ? true : data.isActive === true,
    };
  }

  async createCompetitor(data: Record<string, unknown>): Promise<MarketCompetitorModel> {
    const values = this.validateCompetitor(data);
    if (await MarketCompetitorModel.findOne({ where: { name: { [Op.iLike]: values.name } } })) {
      throw HttpError.conflict('Đối thủ này đã có trong danh sách.');
    }
    return MarketCompetitorModel.create(values);
  }

  async updateCompetitor(id: number, data: Record<string, unknown>): Promise<MarketCompetitorModel> {
    const competitor = await MarketCompetitorModel.findByPk(id);
    if (!competitor) throw HttpError.notFound('Không tìm thấy đối thủ.');
    const values = this.validateCompetitor(data);
    const duplicate = await MarketCompetitorModel.findOne({ where: { name: { [Op.iLike]: values.name } } });
    if (duplicate && duplicate.id !== id) throw HttpError.conflict('Đối thủ này đã có trong danh sách.');
    return competitor.update(values);
  }

  // Removes a competitor with its observations (prices and campaigns are only market data).
  async removeCompetitor(id: number): Promise<void> {
    const competitor = await MarketCompetitorModel.findByPk(id);
    if (!competitor) throw HttpError.notFound('Không tìm thấy đối thủ.');
    await competitor.destroy();
  }

  // ------------------------------------------------------------------ prices

  async listPrices(competitorId?: number): Promise<MarketCompetitorPriceModel[]> {
    return MarketCompetitorPriceModel.findAll({
      where: competitorId ? { competitorId } : {},
      include: [
        { model: MarketCompetitorModel, as: 'competitor', attributes: ['id', 'name'] },
        { model: ProductModel, as: 'ourProduct', attributes: ['id', 'sku', 'name', 'price'] },
      ],
      order: [
        ['observedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: PRICE_PAGE,
    });
  }

  // One price from the form or a CSV row; returns the problems (Vietnamese) and the resolved values.
  private async resolvePrice(
    data: Record<string, unknown>,
    competitors: Map<string, MarketCompetitorModel>,
  ): Promise<{ errors: string[]; price?: PriceInput }> {
    const errors: string[] = [];
    const competitorName = asTrimmedString(data.competitor);
    const competitor = competitors.get(competitorName.toLowerCase());
    if (!competitor) errors.push(`Không có đối thủ "${competitorName}" (thêm đối thủ trước).`);
    const sku = asTrimmedString(data.sku);
    const product = sku ? await ProductModel.findOne({ where: { sku } }) : null;
    if (sku && !product) errors.push(`Không có sản phẩm mã ${sku}.`);
    const url = asTrimmedString(data.url);
    if (url && !isHttpUrl(url)) errors.push('Đường dẫn phải là địa chỉ http(s).');
    if (!sku && !url) errors.push('Cần mã sản phẩm của mình hoặc đường dẫn sản phẩm của đối thủ.');
    const priceVnd = parseVnd(data.price_vnd ?? data.priceVnd);
    if (priceVnd === undefined || priceVnd <= 0 || priceVnd > MAX_PRICE_VND) errors.push('Giá (VND) không hợp lệ.');
    const rawDate = data.observed_at ?? data.observedAt;
    const observedAt = asTrimmedString(rawDate) ? parseDate(rawDate) : new Date();
    if (!observedAt) errors.push('Ngày quan sát không hợp lệ (YYYY-MM-DD).');
    else if (observedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) errors.push('Ngày quan sát ở tương lai.');
    const watch = data.watch === true;
    if (watch && competitor) {
      // The site collector only reads the competitor's own storefront (never a marketplace page).
      const siteHost = competitor.website ? hostOf(competitor.website) : null;
      if (!url || !siteHost || hostOf(url) !== siteHost) {
        errors.push('Chỉ theo dõi tự động được trang sản phẩm trên website riêng của đối thủ.');
      }
    }
    if (errors.length > 0 || !competitor || !observedAt || priceVnd === undefined) return { errors };
    return {
      errors,
      price: {
        competitor,
        product,
        url: url || null,
        title: asTrimmedString(data.title).slice(0, MAX_TITLE) || null,
        priceVnd,
        observedAt,
        watch,
      },
    };
  }

  private async competitorsByName(): Promise<Map<string, MarketCompetitorModel>> {
    const competitors = await MarketCompetitorModel.findAll();
    return new Map(competitors.map((competitor) => [competitor.name.toLowerCase(), competitor]));
  }

  private priceRow(price: PriceInput, source: MarketDataSource) {
    return {
      competitorId: price.competitor.id,
      ourProductId: price.product?.id ?? null,
      url: price.url,
      watch: price.watch,
      source,
      title: price.title,
      priceVnd: price.priceVnd,
      observedAt: price.observedAt,
      confidence: 1,
    };
  }

  async addPrice(data: Record<string, unknown>): Promise<MarketCompetitorPriceModel> {
    const { errors, price } = await this.resolvePrice(data, await this.competitorsByName());
    if (!price) throw HttpError.badRequest('Giá đối thủ chưa hợp lệ.', errors);
    return MarketCompetitorPriceModel.create(this.priceRow(price, 'manual'));
  }

  // The weekly CSV (template: CSV_TEMPLATE). All or nothing: any invalid row rejects the file with one message per
  // row, so a corrected file can simply be imported again.
  async importPrices(csv: unknown): Promise<{ imported: number }> {
    if (typeof csv !== 'string' || !csv.trim()) throw HttpError.badRequest('Tệp CSV trống.');
    let records: Record<string, string>[];
    try {
      records = parse(csv.replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true });
    } catch (error) {
      throw HttpError.badRequest('Không đọc được tệp CSV.', [(error as Error).message]);
    }
    if (records.length === 0) throw HttpError.badRequest('Tệp CSV không có dòng dữ liệu.');
    if (records.length > MAX_CSV_ROWS) throw HttpError.badRequest(`Tối đa ${MAX_CSV_ROWS} dòng mỗi lần nhập.`);
    const missing = CSV_COLUMNS.filter((column) => !(column in records[0]));
    if (missing.length > 0) {
      throw HttpError.badRequest('Tệp CSV thiếu cột.', [`Cần các cột: ${CSV_COLUMNS.join(', ')}.`]);
    }

    const competitors = await this.competitorsByName();
    const prices: PriceInput[] = [];
    const rowErrors: string[] = [];
    for (const [index, record] of records.entries()) {
      const { errors, price } = await this.resolvePrice(record, competitors);
      // Row 1 is the header.
      if (errors.length > 0) rowErrors.push(`Dòng ${index + 2}: ${errors.join(' ')}`);
      else if (price) prices.push(price);
    }
    if (rowErrors.length > 0) throw HttpError.badRequest('Tệp CSV có dòng chưa hợp lệ, chưa nhập dòng nào.', rowErrors);
    await MarketCompetitorPriceModel.bulkCreate(prices.map((price) => this.priceRow(price, 'csv')));
    return { imported: prices.length };
  }

  async removePrice(id: number): Promise<void> {
    const price = await MarketCompetitorPriceModel.findByPk(id);
    if (!price) throw HttpError.notFound('Không tìm thấy giá.');
    await price.destroy();
  }

  // ------------------------------------------------------------------ campaigns, events, sources

  async listCampaigns(): Promise<MarketCompetitorCampaignModel[]> {
    return MarketCompetitorCampaignModel.findAll({
      include: [{ model: MarketCompetitorModel, as: 'competitor', attributes: ['id', 'name'] }],
      order: [
        ['observedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: PRICE_PAGE,
    });
  }

  async addCampaign(data: Record<string, unknown>): Promise<MarketCompetitorCampaignModel> {
    const errors: string[] = [];
    const competitor = await MarketCompetitorModel.findByPk(toInteger(data.competitorId) ?? 0);
    if (!competitor) errors.push('Chọn đối thủ.');
    const title = asTrimmedString(data.title);
    if (title.length < 3 || title.length > MAX_TITLE) errors.push(`Nội dung phải dài 3-${MAX_TITLE} ký tự.`);
    const discountPct = data.discountPct === '' || data.discountPct == null ? null : Number(data.discountPct);
    if (discountPct !== null && (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct > 100)) {
      errors.push('Mức giảm phải từ 0 đến 100%.');
    }
    const startsAt = asTrimmedString(data.startsAt) ? parseDate(data.startsAt) : null;
    const endsAt = asTrimmedString(data.endsAt) ? parseDate(data.endsAt) : null;
    if (startsAt === undefined || endsAt === undefined) errors.push('Ngày không hợp lệ (YYYY-MM-DD).');
    if (startsAt && endsAt && startsAt > endsAt) errors.push('Ngày kết thúc phải sau ngày bắt đầu.');
    const url = asTrimmedString(data.url);
    if (url && !isHttpUrl(url)) errors.push('Đường dẫn phải là địa chỉ http(s).');
    if (errors.length > 0) throw HttpError.badRequest('Chương trình của đối thủ chưa hợp lệ.', errors);
    return MarketCompetitorCampaignModel.create({
      competitorId: (competitor as MarketCompetitorModel).id,
      title,
      category: asTrimmedString(data.category) || null,
      discountPct,
      startsAt,
      endsAt,
      url: url || null,
      source: 'manual',
      observedAt: new Date(),
    });
  }

  async removeCampaign(id: number): Promise<void> {
    const campaign = await MarketCompetitorCampaignModel.findByPk(id);
    if (!campaign) throw HttpError.notFound('Không tìm thấy chương trình.');
    await campaign.destroy();
  }

  // Events from today on, soonest first.
  async listEvents(): Promise<MarketEventModel[]> {
    const today = new Date().toISOString().slice(0, 10);
    return MarketEventModel.findAll({ where: { endsOn: { [Op.gte]: today } }, order: [['startsOn', 'ASC']] });
  }

  async listSources(): Promise<MarketSourceModel[]> {
    return MarketSourceModel.findAll({ order: [['name', 'ASC']] });
  }

  // ------------------------------------------------------------------ Agent API: collector observations

  // `POST /market/observations` (ingestion class, idempotent through AgentActionService). Messages are English.
  async recordObservations(body: Record<string, unknown>, transaction: Transaction): Promise<string> {
    const errors: string[] = [];
    const source = asTrimmedString(body.source);
    if (!SOURCE_NAMES.includes(source)) errors.push(`source must be one of ${SOURCE_NAMES.join(', ')}`);
    const status = (asTrimmedString(body.status) || 'ok') as MarketSourceStatus;
    if (!SOURCE_STATUSES.includes(status)) errors.push(`status must be one of ${SOURCE_STATUSES.join(', ')}`);
    const observedAt = parseDate(body.observed_at);
    if (!observedAt) errors.push('observed_at must be an ISO date-time');
    const list = (name: keyof typeof OBSERVATION_LIMITS): Record<string, unknown>[] => {
      const value = body[name] ?? [];
      if (!Array.isArray(value)) {
        errors.push(`${name} must be an array`);
        return [];
      }
      if (value.length > OBSERVATION_LIMITS[name]) errors.push(`at most ${OBSERVATION_LIMITS[name]} ${name}`);
      return value as Record<string, unknown>[];
    };
    const trends = list('trends');
    const prices = list('competitor_prices');
    const campaigns = list('competitor_campaigns');
    if (errors.length > 0) throw HttpError.badRequest('Invalid request body', errors);

    const trendRows = trends.map((point, index) => {
      const keyword = asTrimmedString(point.keyword);
      const date = asTrimmedString(point.date);
      const interest = toInteger(point.interest);
      if (!keyword || keyword.length > 100) errors.push(`trends[${index}].keyword is required (<= 100 characters)`);
      if (!DATE_ONLY.test(date)) errors.push(`trends[${index}].date must be YYYY-MM-DD`);
      if (interest === undefined || interest < 0 || interest > 100)
        errors.push(`trends[${index}].interest must be 0-100`);
      return { keyword, geo: asTrimmedString(point.geo) || 'VN', date, interest, source };
    });

    const competitors = new Map(
      (await MarketCompetitorModel.findAll({ transaction })).map((item) => [item.name.toLowerCase(), item]),
    );
    const skus = [...new Set(prices.map((price) => asTrimmedString(price.sku)).filter(Boolean))];
    const products = new Map(
      (await ProductModel.findAll({ where: { sku: { [Op.in]: skus } }, transaction })).map((item) => [item.sku, item]),
    );
    const priceSource = COLLECTOR_SOURCES[source];
    if (prices.length > 0 && !priceSource) errors.push(`source ${source} cannot report competitor prices`);
    const priceRows = prices.map((price, index) => {
      const competitor = competitors.get(asTrimmedString(price.competitor).toLowerCase());
      if (!competitor) errors.push(`competitor_prices[${index}].competitor is unknown`);
      const sku = asTrimmedString(price.sku);
      if (sku && !products.has(sku)) errors.push(`competitor_prices[${index}].sku ${sku} is unknown`);
      const url = asTrimmedString(price.url);
      if (!isHttpUrl(url)) errors.push(`competitor_prices[${index}].url must be an http(s) URL`);
      const priceVnd = toInteger(price.price_vnd);
      if (priceVnd === undefined || priceVnd <= 0 || priceVnd > MAX_PRICE_VND) {
        errors.push(`competitor_prices[${index}].price_vnd must be a positive integer`);
      }
      const confidence = price.confidence === undefined ? 1 : Number(price.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        errors.push(`competitor_prices[${index}].confidence must be 0-1`);
      }
      return {
        competitorId: competitor?.id,
        ourProductId: sku ? (products.get(sku)?.id ?? null) : null,
        url,
        watch: priceSource === 'scraper', // the collector keeps reading the pages it was asked to watch
        source: priceSource,
        title: asTrimmedString(price.title).slice(0, MAX_TITLE) || null,
        priceVnd,
        observedAt: parseDate(price.observed_at) ?? observedAt,
        confidence,
      };
    });

    const campaignRows = campaigns.map((campaign, index) => {
      const competitor = competitors.get(asTrimmedString(campaign.competitor).toLowerCase());
      if (!competitor) errors.push(`competitor_campaigns[${index}].competitor is unknown`);
      const title = asTrimmedString(campaign.title).slice(0, MAX_TITLE);
      if (!title) errors.push(`competitor_campaigns[${index}].title is required`);
      const discountPct = campaign.discount_pct == null ? null : Number(campaign.discount_pct);
      if (discountPct !== null && (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct > 100)) {
        errors.push(`competitor_campaigns[${index}].discount_pct must be in (0, 100]`);
      }
      return {
        competitorId: competitor?.id,
        title,
        category: asTrimmedString(campaign.category) || null,
        discountPct,
        startsAt: parseDate(campaign.starts_at) ?? null,
        endsAt: parseDate(campaign.ends_at) ?? null,
        url: asTrimmedString(campaign.url) || null,
        source: priceSource ?? 'fixture',
        observedAt,
      };
    });
    if (errors.length > 0) throw HttpError.badRequest('Invalid request body', errors);

    if (trendRows.length > 0) {
      await MarketTrendPointModel.bulkCreate(trendRows, {
        transaction,
        conflictAttributes: ['keyword', 'geo', 'date'],
        updateOnDuplicate: ['interest', 'source', 'updatedAt'],
      });
    }
    if (priceRows.length > 0) await MarketCompetitorPriceModel.bulkCreate(priceRows, { transaction });
    if (campaignRows.length > 0) await MarketCompetitorCampaignModel.bulkCreate(campaignRows, { transaction });
    const now = new Date();
    await MarketSourceModel.upsert(
      {
        name: source,
        status,
        detail: asTrimmedString(body.detail).slice(0, 1000) || null,
        lastRunAt: now,
        ...(status === 'ok' ? { lastSuccessAt: now } : {}),
      },
      { transaction },
    );
    return `${source} (${status}): ${trendRows.length} trend points, ${priceRows.length} prices, ${campaignRows.length} campaigns`;
  }
}
