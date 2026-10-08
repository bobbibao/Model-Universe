import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import { DAY_MS, daysAgo, daysFromNow, seedNow, vnDate } from './SeedClock';
import { productTier } from './SeedCatalog';
import { DEV_TREND_KEYWORDS } from './AgentSetting.Seeder';
import ProductModel from '../models/Product.Model';
import MarketCompetitorModel from '../models/MarketCompetitor.Model';
import MarketCompetitorPriceModel from '../models/MarketCompetitorPrice.Model';
import MarketCompetitorCampaignModel from '../models/MarketCompetitorCampaign.Model';
import MarketTrendPointModel from '../models/MarketTrendPoint.Model';
import MarketEventModel from '../models/MarketEvent.Model';
import events from './data/events_vn.json';

// Market data. The calendar is reference data for every database (also inserted by its migration); competitors and
// trends are development data: fictional shops on `.example` domains and a synthetic trend history.

// Inserts the calendar's events that are missing (the calendar is apps/agent-service/data/market/events_vn.yaml).
export const ensureMarketEvents = async (): Promise<void> => {
  await MarketEventModel.bulkCreate(
    events.map((event) => ({
      code: event.code,
      name: event.name,
      startsOn: event.starts_on,
      endsOn: event.ends_on,
      leadDays: event.lead_days,
      categories: event.categories,
    })),
    { ignoreDuplicates: true },
  );
};

export const seedMarketEventData = async (): Promise<void> => {
  try {
    await ensureMarketEvents();
    Logger.INFO(`${events.length} market events seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the market events:', error);
    failIfStrict(error);
  }
};

const COMPETITORS = [
  { name: 'Orbit Kits (demo)', website: 'https://orbit-kits.example', source: 'manual' as const },
  { name: 'Colony Hobby (demo)', website: 'https://colony-hobby.example', source: 'csv' as const },
  { name: 'Builder Supply (demo)', website: 'https://builder-supply.example', source: 'csv' as const },
];
const MATCHED_PRODUCTS = 24;
const OBSERVATION_WEEKS = 8;
const UNDERCUT_PRODUCTS = 3;
const UNDERCUT_FACTOR = 0.85; // 15% below our price: above the agent's 8% undercut threshold

const roundToThousand = (amount: number) => Math.round(amount / 1000) * 1000;

// Competitors with weekly prices for some of our products (a few undercut us in the last day) and two campaigns.
export const seedMarketCompetitorData = async (): Promise<void> => {
  try {
    const competitors = await MarketCompetitorModel.bulkCreate(
      COMPETITORS.map(({ name, website }) => ({ name, website, notes: 'Dữ liệu minh hoạ (seed).' })),
      { returning: true },
    );
    const selling = (await ProductModel.findAll({ where: { isArchived: false }, order: [['id', 'ASC']] })).filter(
      (product) => ['popular', 'normal'].includes(productTier(product.sku)),
    );
    const matched: ProductModel[] = faker.helpers.arrayElements(selling, Math.min(MATCHED_PRODUCTS, selling.length));
    const prices = [];
    for (const [index, product] of matched.entries()) {
      const competitorIndex = index % competitors.length;
      const competitor = competitors[competitorIndex];
      const base = faker.number.float({ min: 0.92, max: 1.1 });
      const undercut = index < UNDERCUT_PRODUCTS;
      for (let week = OBSERVATION_WEEKS - 1; week >= 0; week--) {
        const recent = week === 0;
        const factor = undercut && recent ? UNDERCUT_FACTOR : base * faker.number.float({ min: 0.98, max: 1.02 });
        prices.push({
          competitorId: competitor.id,
          ourProductId: product.id,
          url: `${COMPETITORS[competitorIndex].website}/products/${product.sku.toLowerCase()}`,
          watch: false,
          source: COMPETITORS[competitorIndex].source,
          title: product.name.slice(0, 200),
          priceVnd: roundToThousand(product.price * factor),
          observedAt: recent ? daysAgo(1) : daysAgo(week * 7 + 1),
          confidence: COMPETITORS[competitorIndex].source === 'manual' ? 1 : 0.9,
        });
      }
    }
    await MarketCompetitorPriceModel.bulkCreate(prices);
    await MarketCompetitorCampaignModel.bulkCreate([
      {
        competitorId: competitors[1].id,
        title: 'Giảm 30% toàn bộ giày',
        category: 'shoes',
        discountPct: 30,
        startsAt: daysAgo(3),
        endsAt: daysFromNow(5),
        url: `${COMPETITORS[1].website}/khuyen-mai`,
        source: 'csv',
        observedAt: daysAgo(2),
      },
      {
        competitorId: competitors[0].id,
        title: 'Siêu sale 9.9 - giảm đến 40%',
        category: null,
        discountPct: 40,
        startsAt: daysAgo(40),
        endsAt: daysAgo(36),
        url: `${COMPETITORS[0].website}/sale`,
        source: 'manual',
        observedAt: daysAgo(40),
      },
    ]);
    Logger.INFO(`${competitors.length} competitors seeded with ${prices.length} prices and 2 campaigns.`);
  } catch (error) {
    Logger.ERROR('Error seeding the competitors:', error);
    failIfStrict(error);
  }
};

const TREND_DAYS = 90;
const SPIKE_KEYWORD = 'áo khoác';
const SPIKE_DAYS = 7;
const SPIKE_FACTOR = 1.6; // +60% week over week: above the agent's 40% trend-spike threshold

// Daily search interest for the development keywords, with a weekly rhythm and one recent spike.
export const seedMarketTrendData = async (): Promise<void> => {
  try {
    const now = seedNow();
    const points = [];
    for (const { keyword } of DEV_TREND_KEYWORDS) {
      const base = faker.number.int({ min: 30, max: 65 });
      for (let age = TREND_DAYS - 1; age >= 0; age--) {
        const day = new Date(now.getTime() - age * DAY_MS);
        const weekend = [0, 6].includes(day.getUTCDay()) ? 1.1 : 1;
        const spike = keyword === SPIKE_KEYWORD && age < SPIKE_DAYS ? SPIKE_FACTOR : 1;
        const noise = faker.number.float({ min: 0.9, max: 1.1 });
        points.push({
          keyword,
          geo: 'VN',
          date: vnDate(day),
          interest: Math.min(100, Math.round(base * weekend * spike * noise)),
          source: 'seed',
        });
      }
    }
    await MarketTrendPointModel.bulkCreate(points);
    Logger.INFO(`${points.length} trend points seeded for ${DEV_TREND_KEYWORDS.length} keywords.`);
  } catch (error) {
    Logger.ERROR('Error seeding the trend history:', error);
    failIfStrict(error);
  }
};
