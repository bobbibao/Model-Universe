import { Op, Transaction, UniqueConstraintError, WhereOptions } from 'sequelize';
import AgentActionModel from '../database/client/models/AgentAction.Model';
import AgentTaskModel from '../database/client/models/AgentTask.Model';
import CouponModel from '../database/client/models/Coupon.Model';
import MarketingCampaignModel from '../database/client/models/MarketingCampaign.Model';
import ProductDiscountModel from '../database/client/models/ProductDiscount.Model';
import ProductModel, { InventoryStatus, SalesChannel } from '../database/client/models/Product.Model';
import SopChecklistItemModel from '../database/client/models/SopChecklistItem.Model';
import DatabaseProvider from '../database/Database.Provider';
import { AgentApiError, hashAgentRequest } from '../../../shared/server/utils/AgentApiUtils';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';
import {
  AGENT_ROUTES,
  type AgentRoute,
  type ChannelBody,
  type InventoryBody,
  type SopBody,
  type TaskBody,
} from './agent/AgentLimits';
import AgentPolicyService, {
  parseAgentContext,
  type AgentContext,
  type PolicyDecision,
} from './agent/AgentPolicyService';
import {
  DAY_MS,
  lockProductsBySku,
  type Applied,
  type Handler,
  type ProductChange,
  type UndoData,
  type WriteContext,
} from './agent/AgentWrites';
import { notifyAdmins, recordMarketObservations, recordOutcome, syncMetrics } from './agent/IngestionActions';
import {
  activateAd,
  createAd,
  createPost,
  pauseAd,
  revertAdChange,
  revertPost,
  setAdBudget,
  setAdOptimization,
} from './agent/MarketingActions';
import { applyDiscount, createCampaign, createCoupon, endPromotions } from './agent/PromotionActions';
import { demote } from './agent/AutonomyRamp';

// Writes requested by the shop agent through the Agent API (packages/contracts/openapi/web-agent-api.yaml). Every
// write:
// - is applied at most once per Idempotency-Key (a retry with the same payload replays the first response, the same
//   key with another payload is 409 `conflict`); a refused request does not consume its key,
// - is decided by AgentPolicyService (approval grant or auto_low, kill switch, the shop's limits) inside the same
//   transaction that applies it, with agent writes serialized,
// - records its audit (thread, option, approval, grant, trace) and what `revert` needs to compensate it.
// Messages are English (machine-to-machine).

export const INGESTION_ROUTES = [
  'market/observations',
  'marketing/metrics/sync',
  'marketing/outcomes',
  'notifications/admins',
] as const;
export type IngestionRoute = (typeof INGESTION_ROUTES)[number];
export type AgentEndpoint = AgentRoute | IngestionRoute;

export interface AgentRequest {
  route: AgentEndpoint;
  path?: Record<string, string>;
  idempotencyKey: unknown;
  body: unknown;
  approval?: string; // X-Agent-Approval
  context?: string; // X-Agent-Context
  traceparent?: string;
}

export interface AgentResult {
  ref: string;
  detail: string;
}

// The agent's statuses; `restock` puts the product back on sale.
const ADJUSTMENT_STATUSES: Record<InventoryBody['new_status'], InventoryStatus> = {
  restock: 'available',
  available: 'available',
  quarantine: 'quarantine',
  donation_pending: 'donation_pending',
  recycle: 'recycle',
};

const MAX_KEY_LENGTH = 255;
const DRY_RUN_ROLLBACK = Symbol('dry-run rollback');

const isWriteRoute = (route: AgentEndpoint): route is AgentRoute => (AGENT_ROUTES as readonly string[]).includes(route);

// `marketing/ads/{ref}/activate` + {ref: 'x'} -> `marketing/ads/x/activate` (the path a grant names).
export const fillPath = (route: string, path: Record<string, string>) =>
  route.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = path[name];
    if (!value) throw new AgentApiError('invalid_request', `${route} needs the path parameter ${name}`);
    return value;
  });

const adjustInventory: Handler<InventoryBody> = async ({ body, transaction }) => {
  const target = ADJUSTMENT_STATUSES[body.new_status];
  const [product] = await lockProductsBySku([body.sku], transaction);
  const from = product.inventoryStatus;
  // A hold (quarantine, donation, recycling) is lifted by a person in the admin product page, never as a side
  // effect of an agent plan. The agent's own holds are undone through revert, which does not come here.
  if (target === 'available' && from !== 'available') {
    throw new AgentApiError(
      'conflict',
      `${body.sku} is on hold (${from}); an admin must release it before it can be restocked`,
    );
  }
  await product.update({ inventoryStatus: target }, { transaction });
  return {
    detail: `${body.sku}: ${from} -> ${target}${body.reason ? ` (${body.reason})` : ''}`,
    undo: { kind: 'inventory', changes: [{ productId: product.id, sku: body.sku, from, to: target }] },
  };
};

const createTask: Handler<TaskBody> = async ({ body, transaction, actionId, now }) => {
  const dueInDays = body.due_in_days ?? null;
  const task = await AgentTaskModel.create(
    {
      title: body.title,
      assigneeRole: body.assignee_role,
      description: body.description || null,
      dueAt: dueInDays === null ? null : new Date(now.getTime() + dueInDays * DAY_MS),
      agentActionId: actionId,
    },
    { transaction },
  );
  return {
    detail: `task #${task.id} for ${body.assignee_role}: ${body.title}`,
    undo: { kind: 'task', taskId: task.id },
  };
};

const switchChannel: Handler<ChannelBody> = async ({ body, transaction }) => {
  const products = await lockProductsBySku([...new Set(body.skus)], transaction);
  const changes: ProductChange<SalesChannel>[] = [];
  for (const product of products) {
    changes.push({ productId: product.id, sku: product.sku, from: product.salesChannel, to: body.to_channel });
    await product.update({ salesChannel: body.to_channel }, { transaction });
  }
  return { detail: `${products.length} SKU(s) moved to ${body.to_channel}`, undo: { kind: 'channel', changes } };
};

const updateSopChecklist: Handler<SopBody> = async ({ body, transaction, actionId }) => {
  const created = await SopChecklistItemModel.bulkCreate(
    body.add_items.map((text) => ({ sopId: body.sop_id, text: text.trim(), agentActionId: actionId })),
    { transaction, returning: true },
  );
  return {
    detail: `${created.length} item(s) added to ${body.sop_id}`,
    undo: { kind: 'sop_items', itemIds: created.map((item) => item.id) },
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HANDLERS: Record<AgentEndpoint, Handler<any>> = {
  'pricing/discounts': applyDiscount,
  'inventory/adjustments': adjustInventory,
  tasks: createTask,
  'channels/switch': switchChannel,
  'sop/checklists': updateSopChecklist,
  'promotions/coupons': createCoupon,
  'promotions/{ref}/end': endPromotions,
  'marketing/campaigns': createCampaign,
  'marketing/posts': createPost,
  'marketing/ads': createAd,
  'marketing/ads/{ref}/activate': activateAd,
  'marketing/ads/{ref}/pause': pauseAd,
  'marketing/ads/{ref}/budget': setAdBudget,
  'marketing/ads/{ref}/optimization': setAdOptimization,
  'market/observations': recordMarketObservations,
  'marketing/metrics/sync': syncMetrics,
  'marketing/outcomes': recordOutcome,
  'notifications/admins': notifyAdmins,
};

interface Outcome {
  applied: Applied;
  decision: PolicyDecision | null;
}

export interface AuditQuery {
  writeClass?: string;
  q?: string;
  limit: number;
  offset: number;
}

const WRITE_CLASSES = ['shop_change', 'protective', 'ingestion'];

export default class AgentActionService {
  private readonly policy = new AgentPolicyService();

  // The audit trail (/admin/agent/audit): every agent write with its approval, grant, thread and trace, newest first.
  async listAudit({ writeClass, q, limit, offset }: AuditQuery) {
    const where: WhereOptions[] = [];
    if (writeClass && WRITE_CLASSES.includes(writeClass)) where.push({ writeClass });
    const search = asTrimmedString(q);
    if (search) {
      where.push({
        [Op.or]: [
          { idempotencyKey: { [Op.iLike]: `%${search}%` } },
          { endpoint: { [Op.iLike]: `%${search}%` } },
          { threadId: { [Op.iLike]: `%${search}%` } },
        ],
      });
    }
    return AgentActionModel.findAndCountAll({
      where: where.length ? { [Op.and]: where } : {},
      attributes: { exclude: ['requestHash', 'undoData'] },
      order: [['id', 'DESC']],
      limit,
      offset,
    });
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const raw = (
      request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {}
    ) as Record<string, unknown>;
    const { dry_run: dryRun, ...body } = raw;
    if (dryRun !== undefined && typeof dryRun !== 'boolean') {
      throw new AgentApiError('invalid_request', 'dry_run must be true or false');
    }
    const path = request.path ?? {};
    const endpoint = fillPath(request.route, path);
    const context = parseAgentContext(request.context);
    const run = (transaction: Transaction, actionId: number | null, now: Date) =>
      this.apply(
        request.route,
        path,
        endpoint,
        asTrimmedString(request.idempotencyKey),
        body,
        request.approval,
        context,
        {
          transaction,
          actionId,
          now,
          dryRun: dryRun === true,
        },
      );

    if (dryRun === true) return this.preview(run);
    const result = await this.runOnce(endpoint, request.idempotencyKey, body, context, request.traceparent, run);
    if (result.protective)
      await this.policy.notifyProtective(endpoint, result.response.detail, String(request.idempotencyKey));
    return result.response;
  }

  // Compensates an earlier action (protective). Reverting an action twice is harmless: the second call reports it.
  async revert(rawKey: unknown, ofKey: string, rawContext?: string, traceparent?: string): Promise<AgentResult> {
    const context = parseAgentContext(rawContext);
    const result = await this.runOnce(
      'revert',
      rawKey,
      { of_key: ofKey },
      context,
      traceparent,
      async (transaction, _id, now) => {
        await this.policy.serialize(transaction);
        const target = await AgentActionModel.findOne({
          where: { idempotencyKey: ofKey },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!target) throw new AgentApiError('not_found', `No action with idempotency key ${ofKey}`);
        if (target.endpoint === 'revert') throw new AgentApiError('invalid_request', 'A revert cannot be reverted');
        if (target.status === 'reverted') {
          return { applied: { detail: `already reverted (by ${target.revertedByKey})`, undo: null }, decision: null };
        }
        const detail = await this.applyUndo((target.undoData as UndoData | null) ?? null, transaction, now);
        await target.update(
          { status: 'reverted', revertedByKey: asTrimmedString(rawKey), revertedAt: now },
          { transaction },
        );
        return { applied: { detail: `reverted ${target.endpoint}: ${detail}`, undo: null }, decision: null };
      },
      'protective',
    );
    await this.policy.notifyProtective(`actions/${ofKey}/revert`, result.response.detail, String(rawKey));
    return result.response;
  }

  // ------------------------------------------------------------------ one write

  private async apply(
    route: AgentEndpoint,
    path: Record<string, string>,
    endpoint: string,
    idempotencyKey: string,
    body: Record<string, unknown>,
    grant: string | undefined,
    context: AgentContext,
    base: Pick<WriteContext<unknown>, 'transaction' | 'actionId' | 'now' | 'dryRun'>,
  ): Promise<Outcome> {
    await this.policy.serialize(base.transaction);
    const decision = isWriteRoute(route)
      ? await this.policy.decide(
          { route, path, endpoint, idempotencyKey, body, grant, context },
          base.transaction,
          base.now,
        )
      : null;
    const applied = await HANDLERS[route]({ ...base, path, body: decision ? decision.verdict.body : body, decision });
    // An incident (the agent's in-flight guard acted): its capabilities go back to asking a person.
    if (decision?.verdict.writeClass === 'protective' && context.action_id?.startsWith('guard-') && !base.dryRun) {
      await demote(decision.verdict.capabilities, `incident ${context.action_id} (${endpoint})`, base.transaction);
    }
    return { applied, decision };
  }

  // ------------------------------------------------------------------ idempotency

  private async runOnce(
    endpoint: string,
    rawKey: unknown,
    body: Record<string, unknown>,
    context: AgentContext,
    traceparent: string | undefined,
    apply: (transaction: Transaction, actionId: number, now: Date) => Promise<Outcome>,
    writeClass?: 'protective',
  ): Promise<{ response: AgentResult; protective: boolean }> {
    const idempotencyKey = asTrimmedString(rawKey);
    if (!idempotencyKey) throw new AgentApiError('invalid_request', 'Idempotency-Key header is required');
    if (idempotencyKey.length > MAX_KEY_LENGTH) {
      throw new AgentApiError('invalid_request', `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`);
    }
    const requestHash = hashAgentRequest(endpoint, body);

    // Replay first: a retry never needs its grant again and never runs the rules against a state it changed.
    const existing = await AgentActionModel.findOne({ where: { idempotencyKey } });
    if (existing) return { response: this.replay(existing, requestHash), protective: false };

    try {
      return await DatabaseProvider.getInstance().transaction(async (transaction) => {
        // The row is inserted first: a concurrent request with the same key blocks on the unique index
        // and then fails, instead of applying the action a second time.
        const action = await AgentActionModel.create(
          { idempotencyKey, endpoint, requestHash, responseBody: { ref: '', detail: '' } },
          { transaction },
        );
        const { applied, decision } = await apply(transaction, action.id, new Date());
        const response = { ref: `agent-action-${action.id}`, detail: applied.detail };
        const audit = this.policy.audit(decision, context, traceparent);
        if (writeClass) Object.assign(audit, { writeClass, approvalMode: writeClass });
        await action.update({ responseBody: response, undoData: applied.undo, ...audit }, { transaction });
        return { response, protective: audit.writeClass === 'protective' };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const winner = await AgentActionModel.findOne({ where: { idempotencyKey } });
        if (winner) return { response: this.replay(winner, requestHash), protective: false };
      }
      throw error;
    }
  }

  private replay(action: AgentActionModel, requestHash: string): AgentResult {
    if (action.requestHash !== requestHash) {
      throw new AgentApiError('conflict', 'Idempotency-Key was already used with a different payload');
    }
    return action.responseBody;
  }

  // Runs the write in a transaction that is always rolled back: the same checks, nothing kept, no platform call, and
  // the idempotency key is not consumed.
  private async preview(run: (transaction: Transaction, actionId: null, now: Date) => Promise<Outcome>) {
    let outcome: Outcome | undefined;
    try {
      await DatabaseProvider.getInstance().transaction(async (transaction) => {
        outcome = await run(transaction, null, new Date());
        throw DRY_RUN_ROLLBACK;
      });
    } catch (error) {
      if (error !== DRY_RUN_ROLLBACK) throw error;
    }
    return { ref: 'dry-run', detail: `dry run: ${outcome?.applied.detail ?? ''}` };
  }

  // ------------------------------------------------------------------ compensation

  private async applyUndo(undo: UndoData | null, transaction: Transaction, now: Date): Promise<string> {
    if (!undo) return 'nothing to undo';
    switch (undo.kind) {
      case 'inventory':
        return this.restoreProducts(undo.changes, 'inventoryStatus', transaction);
      case 'channel':
        return this.restoreProducts(undo.changes, 'salesChannel', transaction);
      case 'discount': {
        const [ended] = await ProductDiscountModel.update(
          { revokedAt: now },
          { where: { id: { [Op.in]: undo.discountIds }, revokedAt: null }, transaction },
        );
        // The agent's discounts it replaced run again (if they have not ended meanwhile).
        const [resumed] = undo.replacedIds?.length
          ? await ProductDiscountModel.update(
              { revokedAt: null },
              { where: { id: { [Op.in]: undo.replacedIds }, endsAt: { [Op.gt]: now } }, transaction },
            )
          : [0];
        return `${ended} discount(s) ended${resumed ? `; ${resumed} replaced discount(s) resumed` : ''}`;
      }
      case 'task': {
        const task = await AgentTaskModel.findByPk(undo.taskId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!task) return 'task no longer exists';
        if (task.status !== 'OPEN') return `task #${task.id} left as ${task.status}`;
        await task.update({ status: 'CANCELLED' }, { transaction });
        return `task #${task.id} cancelled`;
      }
      case 'sop_items': {
        const [removed] = await SopChecklistItemModel.update(
          { removedAt: now },
          { where: { id: { [Op.in]: undo.itemIds }, removedAt: null }, transaction },
        );
        return `${removed} checklist item(s) removed`;
      }
      case 'coupon': {
        const [disabled] = await CouponModel.update(
          { isActive: false },
          { where: { id: undo.couponId, isActive: true }, transaction },
        );
        return disabled ? 'coupon disabled' : 'coupon already disabled';
      }
      case 'campaign': {
        const [reverted] = await MarketingCampaignModel.update(
          { status: 'reverted' },
          { where: { ref: undo.ref, status: { [Op.ne]: 'reverted' } }, transaction },
        );
        return reverted ? `campaign ${undo.ref} reverted` : `campaign ${undo.ref} already reverted`;
      }
      case 'post':
        return revertPost(undo.ref, transaction, now);
      case 'ad':
      case 'activation':
      case 'budget':
      case 'objective':
        return revertAdChange(undo, transaction);
    }
  }

  // Restores a column only where it still holds what the agent set; a value changed since (e.g. by an admin)
  // is left alone and reported.
  private async restoreProducts<T extends string>(
    changes: ProductChange<T>[],
    column: 'inventoryStatus' | 'salesChannel',
    transaction: Transaction,
  ): Promise<string> {
    const products = await ProductModel.findAll({
      where: { id: { [Op.in]: changes.map((change) => change.productId) } },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const skipped: string[] = [];
    let restored = 0;
    for (const change of changes) {
      const product = byId.get(change.productId);
      if (!product || product.get(column) !== change.to) {
        skipped.push(change.sku);
        continue;
      }
      await product.update({ [column]: change.from }, { transaction });
      restored++;
    }
    return `${restored} SKU(s) restored${skipped.length ? `; left unchanged (modified since): ${skipped.join(', ')}` : ''}`;
  }
}
