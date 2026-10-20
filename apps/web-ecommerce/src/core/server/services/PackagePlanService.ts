import { createHash } from 'crypto';
import type { Transaction } from 'sequelize';
import HttpError from '../../../shared/server/utils/HttpError';
import OrderPackagePlanModel from '../database/client/models/OrderPackagePlan.Model';
import {
  estimateFeeByWeightVnd,
  type CarrierQuote,
  type DeliveryAddress,
  type ShippingQuoteSnapshot,
} from '../../../shared/fulfillment';
import { splitVnd } from '../../../shared/packing/cod';
import { pricePlan, rankPlans, type PricedPlan } from '../../../shared/packing/cost';
import type { PackUnit } from '../../../shared/packing/geometry';
import { candidatePlans, type CandidatePlan, type PlanProblem } from '../../../shared/packing/optimizer';
import { toSnapshot, withOrderItems, type PackagePlanSnapshot } from '../../../shared/packing/plan';
import { productPackaging, type PackingConfig, type ProductPackaging } from '../../../shared/packing/rules';
import * as SuperAi from './delivery/SuperAiClient';
import PackingService from './PackingService';

// One line of the bag or order to pack.
export interface PlanItem {
  productId: number;
  name: string;
  quantity: number;
  lineTotalVnd: number;
  product: { packaging?: ProductPackaging | null; grade?: string | null };
}

// The plan items of resolved cart lines (CartService.resolveLines).
export const planItems = (
  lines: readonly { productId: number; quantity: number; lineTotal: number; product: { name: string } | null }[],
  products: ReadonlyMap<number, { name: string; packaging?: ProductPackaging | null; grade?: string | null }>,
): PlanItem[] =>
  lines.map((line) => {
    const product = products.get(line.productId);
    return {
      productId: line.productId,
      name: line.product?.name ?? product?.name ?? `#${line.productId}`,
      quantity: line.quantity,
      lineTotalVnd: line.lineTotal,
      product: { packaging: product?.packaging ?? null, grade: product?.grade ?? null },
    };
  });

export interface PlanRoute {
  origin: { provinceName: string; districtName: string } | null;
  address: DeliveryAddress;
}

export interface PackingQuote {
  quote: ShippingQuoteSnapshot;
  alternatives: PackagePlanSnapshot[];
  estimatedProductIds: number[];
}

// Candidate plans per carrier rule set worth pricing with the carrier (ranked first by the local fee estimate).
const PLANS_TO_PRICE = 4;
const PRICE_TTL_MS = 10 * 60_000;
const PRICE_CONCURRENCY = 4;
const priceCache = new Map<string, { at: number; rows: Promise<CarrierQuote[]> }>();

const problemMessage: Record<PlanProblem['code'], string> = {
  NO_UNITS: 'There is nothing to ship.',
  TOO_MANY_UNITS: 'This order is too large to plan automatically: the shop will arrange its delivery.',
  NO_CARTONS: 'The shop has no active cartons: staff must add them in Admin → Delivery.',
  OVERSIZE: 'An item is larger than any carton the carrier accepts: the shop will arrange its delivery.',
  NO_FIT: 'This order needs more parcels than allowed: the shop will arrange its delivery.',
};

// The carrier quote of a whole plan: its parcels added up (the delivery estimate of the slowest parcel).
const sumQuotes = (rows: CarrierQuote[]): CarrierQuote => ({
  carrierId: rows[0].carrierId,
  carrierName: rows[0].carrierName,
  shipmentFeeVnd: rows.reduce((sum, row) => sum + row.shipmentFeeVnd, 0),
  insuranceFeeVnd: rows.reduce((sum, row) => sum + row.insuranceFeeVnd, 0),
  feeVnd: rows.reduce((sum, row) => sum + row.feeVnd, 0),
  estimatedPickup: rows[0].estimatedPickup,
  estimatedDelivery: rows.map((row) => row.estimatedDelivery).find(Boolean) ?? null,
});

// Plans how an order ships (package optimizer, src/shared/packing): the units of every line, the candidate cartons
// and parcel splits within each carrier's limits, priced with SuperAI per parcel, the cheapest plan and carrier chosen.
export default class PackagePlanService {
  private packing = new PackingService();

  // The units to pack (an order line of quantity 3 is three units), each with its share of the line value.
  // `orderItemId` is the line's position (1-based) until the order exists.
  units(items: readonly PlanItem[], config: PackingConfig) {
    const estimatedProductIds = new Set<number>();
    const units: PackUnit[] = [];
    items.forEach((item, line) => {
      const { packaging, source } = productPackaging(config, item.product);
      if (source !== 'product') estimatedProductIds.add(item.productId);
      const values = splitVnd(item.lineTotalVnd, new Array(item.quantity).fill(1));
      for (let n = 0; n < item.quantity; n++)
        units.push({
          key: `${line + 1}-${n + 1}`,
          orderItemId: line + 1,
          productId: item.productId,
          name: item.name,
          ...packaging,
          valueVnd: values[n],
        });
    });
    return { units, estimatedProductIds: [...estimatedProductIds].sort((a, b) => a - b) };
  }

  private price(route: PlanRoute, weightGram: number, valueVnd: number) {
    const key = [
      route.origin!.provinceName,
      route.origin!.districtName,
      route.address.provinceName,
      route.address.districtName,
      weightGram,
      valueVnd,
    ].join('|');
    const cached = priceCache.get(key);
    if (cached && Date.now() - cached.at < PRICE_TTL_MS) return cached.rows;
    const rows = SuperAi.price({
      senderProvince: route.origin!.provinceName,
      senderDistrict: route.origin!.districtName,
      receiverProvince: route.address.provinceName,
      receiverDistrict: route.address.districtName,
      weightGram,
      valueVnd,
    });
    priceCache.set(key, { at: Date.now(), rows });
    // A failed call is not remembered.
    rows.catch(() => priceCache.delete(key));
    return rows;
  }

  // SuperAI's prices for every (weight, value) pair, a few calls at a time.
  private async priceAll(route: PlanRoute, pairs: [number, number][]) {
    const unique = [...new Map(pairs.map((pair) => [pair.join(':'), pair])).values()];
    const result = new Map<string, CarrierQuote[]>();
    for (let start = 0; start < unique.length; start += PRICE_CONCURRENCY) {
      const batch = unique.slice(start, start + PRICE_CONCURRENCY);
      const rows = await Promise.all(batch.map(([weight, value]) => this.price(route, weight, value)));
      batch.forEach((pair, index) => result.set(pair.join(':'), rows[index]));
    }
    return result;
  }

  // The first plan of a new order: the one its checkout quoted and the customer paid for (order lines by position
  // become order item ids). Inside the order transaction.
  async recordQuoted(
    orderId: number,
    quote: ShippingQuoteSnapshot,
    orderItemIds: readonly number[],
    transaction: Transaction,
  ) {
    if (!quote.plan) return null;
    const plan = withOrderItems(quote.plan, orderItemIds);
    return OrderPackagePlanModel.create(
      {
        orderId,
        version: 1,
        status: 'PROPOSED',
        plan,
        problem: null,
        alternatives: [],
        estimatedProductIds: [],
        chargedFeeVnd: quote.feeVnd,
        inputsDigest: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
        createdByUserId: null,
        note: null,
      },
      { transaction },
    );
  }

  // Every version of the order's package plan, newest first (the first one not superseded is in force).
  async versions(orderId: number) {
    return OrderPackagePlanModel.findAll({ where: { orderId }, order: [['version', 'DESC']] });
  }

  // A new version of the order's plan (a fresh optimizer run, or one of the alternatives staff chose); the previous
  // version is superseded. Plans never change once written.
  async saveVersion(
    orderId: number,
    input: {
      plan: PackagePlanSnapshot;
      alternatives: PackagePlanSnapshot[];
      estimatedProductIds: number[];
      chargedFeeVnd: number;
      createdByUserId: number;
      note: string | null;
      expectedVersion: unknown;
    },
    transaction: Transaction,
  ) {
    const current = await OrderPackagePlanModel.findOne({
      where: { orderId },
      order: [['version', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if ((current?.version ?? 0) !== (input.expectedVersion ?? 0))
      throw HttpError.conflict('The package plan changed: reload it first.', 'PLAN_CHANGED');
    if (current && current.status !== 'SUPERSEDED') await current.update({ status: 'SUPERSEDED' }, { transaction });
    return OrderPackagePlanModel.create(
      {
        orderId,
        version: (current?.version ?? 0) + 1,
        status: 'PROPOSED',
        plan: input.plan,
        problem: null,
        alternatives: input.alternatives,
        estimatedProductIds: input.estimatedProductIds,
        chargedFeeVnd: input.chargedFeeVnd,
        inputsDigest: createHash('sha256').update(JSON.stringify(input.plan)).digest('hex'),
        createdByUserId: input.createdByUserId,
        note: input.note,
      },
      { transaction },
    );
  }

  async quote(items: readonly PlanItem[], route: PlanRoute): Promise<PackingQuote> {
    const [config, cartons] = await Promise.all([this.packing.config(), this.packing.cartons(true)]);
    const { units, estimatedProductIds } = this.units(items, config);
    const { settings } = config;
    const live = SuperAi.superAiConfigured();
    if (live && !route.origin)
      throw HttpError.serviceUnavailable(
        'Delivery is not set up yet: staff must choose the SuperAI pickup warehouse in Admin → Delivery.',
        'SHIPPING_ORIGIN_MISSING',
      );
    // Candidate plans per carrier rule set ("default" for carriers without limits of their own).
    const ruleKeys = live ? Object.keys(config.carriers) : ['default'];
    const plansByRule = new Map<string, CandidatePlan[]>();
    for (const key of ruleKeys) {
      const { plans, problem } = candidatePlans(units, cartons, config.carriers[key], settings);
      if (problem && key === 'default') throw HttpError.conflict(problemMessage[problem.code], 'PACKING_REVIEW');
      plansByRule.set(
        key,
        rankPlans(plans.map((plan) => pricePlan(plan, null, estimateFeeByWeightVnd, settings)!))
          .slice(0, PLANS_TO_PRICE)
          .map((priced) => priced.plan),
      );
    }
    const totalWeight = (priced: PricedPlan) =>
      priced.plan.parcels.reduce((sum, parcel) => sum + parcel.billableWeightGram, 0);

    if (!live) {
      const ranked = rankPlans(
        plansByRule.get('default')!.map((plan) => pricePlan(plan, null, estimateFeeByWeightVnd, settings)!),
      );
      const best = ranked[0];
      return {
        quote: {
          feeVnd: best.totals.carrierFeeVnd,
          carrier: null,
          options: [],
          weightGram: totalWeight(best),
          source: 'estimate',
          plan: toSnapshot(best, config.carriers.default.verified),
        },
        alternatives: ranked.slice(1, 4).map((priced) => toSnapshot(priced, config.carriers.default.verified)),
        estimatedProductIds,
      };
    }

    // Every parcel of every candidate priced exactly (its billable weight and declared goods value): one SuperAI call
    // answers for all carriers.
    const pairKey = (weight: number, value: number) => `${weight}:${value}`;
    const prices = await this.priceAll(
      route,
      [...plansByRule.values()].flatMap((plans) =>
        plans.flatMap((plan) =>
          plan.parcels.map((parcel) => [parcel.billableWeightGram, parcel.declaredValueVnd] as [number, number]),
        ),
      ),
    );
    const carriers = new Map<number, string>();
    for (const rows of prices.values())
      for (const row of rows) if (row.feeVnd > 0) carriers.set(row.carrierId, row.carrierName);
    const rowFor = (carrierId: number, weight: number, value: number) =>
      prices.get(pairKey(weight, value))?.find((row) => row.carrierId === carrierId && row.feeVnd > 0) ?? null;
    const priced: PricedPlan[] = [];
    for (const carrierId of carriers.keys()) {
      const ruleKey = config.carriers[String(carrierId)] ? String(carrierId) : 'default';
      for (const plan of plansByRule.get(ruleKey) ?? []) {
        const result = pricePlan(
          plan,
          carrierId,
          (weight, parcel) => rowFor(carrierId, weight, parcel.declaredValueVnd)?.feeVnd ?? null,
          settings,
        );
        if (result) priced.push(result);
      }
    }
    const ranked = rankPlans(priced);
    if (!ranked.length)
      throw HttpError.conflict('No carrier delivers to this address right now. Check the address.', 'NO_CARRIER');
    const quoteOf = (plan: PricedPlan) =>
      sumQuotes(
        plan.plan.parcels.map((parcel) => rowFor(plan.carrierId!, parcel.billableWeightGram, parcel.declaredValueVnd)!),
      );
    const verified = (plan: PricedPlan) =>
      (config.carriers[String(plan.carrierId)] ?? config.carriers.default).verified;
    const best = ranked[0];
    // The cheapest plan of each carrier, for the customer's comparison.
    const perCarrier = [...carriers.keys()]
      .map((carrierId) => ranked.find((plan) => plan.carrierId === carrierId))
      .filter((plan): plan is PricedPlan => !!plan)
      .map(quoteOf)
      .sort((a, b) => a.feeVnd - b.feeVnd || a.carrierId - b.carrierId);
    return {
      quote: {
        feeVnd: best.totals.carrierFeeVnd,
        carrier: quoteOf(best),
        options: perCarrier,
        weightGram: totalWeight(best),
        source: 'superai',
        plan: toSnapshot(best, verified(best)),
      },
      alternatives: ranked.slice(1, 4).map((plan) => toSnapshot(plan, verified(plan))),
      estimatedProductIds,
    };
  }
}
