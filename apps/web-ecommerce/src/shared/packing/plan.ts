import { splitVnd } from './cod';
import type { PricedPlan } from './cost';
import type { Placement } from './geometry';
import { PACKING_ALGORITHM_VERSION, type PlanProblem } from './optimizer';

export interface ParcelItem {
  orderItemId: number;
  productId: number;
  name: string;
  quantity: number;
}

// One parcel of a stored plan (one carrier waybill), as checkout quoted it and staff pack it.
export interface ParcelSnapshot {
  index: number;
  cartonCode: string;
  cartonName: string;
  outerCm: [number, number, number];
  actualWeightGram: number;
  volumetricWeightGram: number;
  billableWeightGram: number;
  feeVnd: number;
  // The goods value inside, at the order's unit prices.
  goodsValueVnd: number;
  items: ParcelItem[];
  placements: Placement[];
}

// How an order ships: its parcels, the carrier, and what that costs. Stored on the checkout session and the order
// (what the customer paid for) and as versions on `order_package_plan` (what staff pack).
export interface PackagePlanSnapshot {
  algorithmVersion: string;
  carrierId: number | null;
  carrierRuleVerified: boolean;
  parcels: ParcelSnapshot[];
  carrierFeeVnd: number;
  cartonVnd: number;
  handlingVnd: number;
  totalVnd: number;
}

export const toSnapshot = (priced: PricedPlan, carrierRuleVerified: boolean): PackagePlanSnapshot => ({
  algorithmVersion: PACKING_ALGORITHM_VERSION,
  carrierId: priced.carrierId,
  carrierRuleVerified,
  parcels: priced.plan.parcels.map((parcel, index) => {
    const items = new Map<number, ParcelItem>();
    for (const unit of parcel.units) {
      const item = items.get(unit.orderItemId) ?? {
        orderItemId: unit.orderItemId,
        productId: unit.productId,
        name: unit.name,
        quantity: 0,
      };
      item.quantity++;
      items.set(unit.orderItemId, item);
    }
    return {
      index: index + 1,
      cartonCode: parcel.carton.code,
      cartonName: parcel.carton.name,
      outerCm: [parcel.carton.outerLengthCm, parcel.carton.outerWidthCm, parcel.carton.outerHeightCm],
      actualWeightGram: parcel.actualWeightGram,
      volumetricWeightGram: parcel.volumetricWeightGram,
      billableWeightGram: parcel.billableWeightGram,
      feeVnd: priced.parcelFeesVnd[index],
      goodsValueVnd: parcel.declaredValueVnd,
      items: [...items.values()].sort((a, b) => a.orderItemId - b.orderItemId),
      placements: parcel.placements,
    };
  }),
  carrierFeeVnd: priced.totals.carrierFeeVnd,
  cartonVnd: priced.totals.cartonVnd,
  handlingVnd: priced.totals.handlingVnd,
  totalVnd: priced.totals.totalVnd,
});

// The cash each parcel's courier collects: the order's COD split by the goods value of each parcel.
export const parcelCodVnd = (plan: Pick<PackagePlanSnapshot, 'parcels'>, codVnd: number) =>
  splitVnd(
    codVnd,
    plan.parcels.map((parcel) => parcel.goodsValueVnd),
  );

// Why an order could not be planned automatically (staff decide the packing).
export type PlanReview = PlanProblem;
