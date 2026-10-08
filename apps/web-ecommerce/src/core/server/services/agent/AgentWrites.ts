import { Op, Transaction } from 'sequelize';
import type { AdStatus } from '../../database/client/models/AdCampaign.Model';
import ProductModel, { InventoryStatus, SalesChannel } from '../../database/client/models/Product.Model';
import { AgentApiError } from '../../../../shared/server/utils/AgentApiUtils';
import type { PolicyDecision } from './AgentPolicyService';

// What every Agent API handler gets and returns (AgentActionService runs them).

export type ProductChange<T> = { productId: number; sku: string; from: T; to: T };

// What `revert` needs to compensate an action (stored on its agent_action row).
export type UndoData =
  | { kind: 'inventory'; changes: ProductChange<InventoryStatus>[] }
  | { kind: 'channel'; changes: ProductChange<SalesChannel>[] }
  | { kind: 'discount'; discountIds: number[]; replacedIds?: number[] }
  | { kind: 'task'; taskId: number }
  | { kind: 'sop_items'; itemIds: number[] }
  | { kind: 'coupon'; couponId: number }
  | { kind: 'campaign'; ref: string; previous: string }
  | { kind: 'post'; ref: string }
  | { kind: 'ad'; ref: string }
  | { kind: 'activation'; ref: string; previous: AdStatus }
  | { kind: 'budget'; ref: string; daily: number; total: number; reserved: number }
  | { kind: 'objective'; ref: string; previous: 'traffic' | 'conversions' };

export interface Applied {
  detail: string;
  undo: UndoData | null;
}

export interface WriteContext<B> {
  body: B;
  path: Record<string, string>;
  transaction: Transaction;
  actionId: number | null; // null in a dry run
  now: Date;
  // A dry run validates and previews in a transaction that is rolled back: nothing may leave the shop.
  dryRun: boolean;
  decision: PolicyDecision | null; // null for ingestion
}

export type Handler<B = never> = (context: WriteContext<B>) => Promise<Applied>;

export const DAY_MS = 24 * 60 * 60 * 1000;

// Loads and locks the products for the given SKUs (in id order, like checkout); unknown SKUs are a 404.
export const lockProductsBySku = async (skus: string[], transaction: Transaction): Promise<ProductModel[]> => {
  const products = await ProductModel.findAll({
    where: { sku: { [Op.in]: skus } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const found = new Set(products.map((product) => product.sku));
  const missing = skus.filter((sku) => !found.has(sku));
  if (missing.length > 0) throw new AgentApiError('not_found', `Unknown SKU(s): ${missing.join(', ')}`);
  if (products.some(product => product.partnerId)) throw new AgentApiError('approval_required', 'Partner merchandise requires the seller moderation workflow.', {reason:'seller_workflow_required'});
  return products;
};
