import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import AgentActionModel from '../database/client/models/AgentAction.Model';
import AgentTaskModel from '../database/client/models/AgentTask.Model';
import ProductDiscountModel from '../database/client/models/ProductDiscount.Model';
import ProductModel, { InventoryStatus, SALES_CHANNELS, SalesChannel } from '../database/client/models/Product.Model';
import SopChecklistItemModel from '../database/client/models/SopChecklistItem.Model';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';
import { hashAgentRequest } from '../../../shared/server/utils/AgentApiUtils';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';

// Writes requested by the shop agent (Act phase) through the Agent API. Every write:
// - is applied at most once per Idempotency-Key (a retry with the same payload replays the first response,
//   the same key with another payload is rejected with 409),
// - runs in one transaction with the affected product rows locked in id order,
// - records what `revert` needs to compensate it (`undoData`).
// Contract: packages/contracts/openapi/web-agent-api.yaml. Messages are English (machine-to-machine).

export type AgentEndpoint =
  'inventory/adjustments' | 'pricing/discounts' | 'tasks' | 'channels/switch' | 'sop/checklists';

export interface AgentResult {
  ref: string;
  detail: string;
}

type ProductChange<T> = { productId: number; sku: string; from: T; to: T };

type UndoData =
  | { kind: 'inventory'; changes: ProductChange<InventoryStatus>[] }
  | { kind: 'channel'; changes: ProductChange<SalesChannel>[] }
  | { kind: 'discount'; discountIds: number[] }
  | { kind: 'task'; taskId: number }
  | { kind: 'sop_items'; itemIds: number[] };

interface Applied {
  detail: string;
  undo: UndoData | null;
}

type Handler = (body: Record<string, unknown>, transaction: Transaction, actionId: number | null) => Promise<Applied>;

// The agent's statuses; `restock` puts the product back on sale.
const ADJUSTMENT_STATUSES: Record<string, InventoryStatus> = {
  restock: 'available',
  available: 'available',
  quarantine: 'quarantine',
  donation_pending: 'donation_pending',
  recycle: 'recycle',
};

const MAX_KEY_LENGTH = 255;
const MAX_SKUS = 500;
const MAX_DISCOUNT_PERCENT = 90;
const MAX_DISCOUNT_DAYS = 90;
const MAX_TASK_DUE_DAYS = 365;
const MAX_CHECKLIST_ITEMS = 50;
const MAX_TEXT_LENGTH = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DRY_RUN_ROLLBACK = Symbol('dry-run rollback');

const invalid = (messages: string[]) => HttpError.badRequest('Invalid request body', messages);

const toSkuList = (value: unknown, errors: string[]): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('skus must be a non-empty array of strings');
    return [];
  }
  const skus = Array.from(new Set(value.map((sku) => asTrimmedString(sku))));
  if (skus.some((sku) => !sku)) errors.push('skus must be non-empty strings');
  if (skus.length > MAX_SKUS) errors.push(`at most ${MAX_SKUS} skus per request`);
  return skus;
};

const toText = (value: unknown, field: string, errors: string[], { required = false, max = MAX_TEXT_LENGTH } = {}) => {
  const text = asTrimmedString(value);
  if (required && !text) errors.push(`${field} is required`);
  if (text.length > max) errors.push(`${field} must be at most ${max} characters`);
  return text;
};

// Loads and locks the products for the given SKUs (in id order, like checkout); unknown SKUs are a 404.
const lockProductsBySku = async (skus: string[], transaction: Transaction): Promise<ProductModel[]> => {
  const products = await ProductModel.findAll({
    where: { sku: { [Op.in]: skus } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const found = new Set(products.map((product) => product.sku));
  const missing = skus.filter((sku) => !found.has(sku));
  if (missing.length > 0) throw HttpError.notFound(`Unknown SKU(s): ${missing.join(', ')}`);
  return products;
};

export default class AgentActionService {
  private handlers: Record<AgentEndpoint, Handler> = {
    'inventory/adjustments': (body, t) => this.adjustInventory(body, t),
    'pricing/discounts': (body, t, actionId) => this.applyDiscount(body, t, actionId),
    tasks: (body, t, actionId) => this.createTask(body, t, actionId),
    'channels/switch': (body, t) => this.switchChannel(body, t),
    'sop/checklists': (body, t, actionId) => this.updateSopChecklist(body, t, actionId),
  };

  async execute(endpoint: AgentEndpoint, rawKey: unknown, rawBody: unknown): Promise<AgentResult> {
    const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
    const handler = this.handlers[endpoint];
    if (body.dry_run === true) return this.preview(handler, body);
    return this.runOnce(endpoint, rawKey, body, (t, actionId) => handler(body, t, actionId));
  }

  // Compensates an earlier action. Reverting an action twice is harmless: the second call reports it.
  async revert(rawKey: unknown, ofKey: string): Promise<AgentResult> {
    return this.runOnce('revert', rawKey, { of_key: ofKey }, async (transaction) => {
      const target = await AgentActionModel.findOne({
        where: { idempotencyKey: ofKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!target) throw HttpError.notFound(`No action with idempotency key ${ofKey}`);
      if (target.endpoint === 'revert') throw HttpError.badRequest('A revert cannot be reverted');
      if (target.status === 'reverted') return { detail: `already reverted (by ${target.revertedByKey})`, undo: null };
      const detail = await this.applyUndo((target.undoData as UndoData | null) ?? null, transaction);
      await target.update(
        { status: 'reverted', revertedByKey: asTrimmedString(rawKey), revertedAt: new Date() },
        { transaction },
      );
      return { detail: `reverted ${target.endpoint}: ${detail}`, undo: null };
    });
  }

  // ------------------------------------------------------------------ idempotency

  private async runOnce(
    endpoint: string,
    rawKey: unknown,
    body: Record<string, unknown>,
    apply: (transaction: Transaction, actionId: number) => Promise<Applied>,
  ): Promise<AgentResult> {
    const idempotencyKey = asTrimmedString(rawKey);
    if (!idempotencyKey) throw HttpError.badRequest('Idempotency-Key header is required');
    if (idempotencyKey.length > MAX_KEY_LENGTH) {
      throw HttpError.badRequest(`Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`);
    }
    const requestHash = hashAgentRequest(endpoint, body);

    const existing = await AgentActionModel.findOne({ where: { idempotencyKey } });
    if (existing) return this.replay(existing, requestHash);

    try {
      return await DatabaseProvider.getInstance().transaction(async (transaction) => {
        // The row is inserted first: a concurrent request with the same key blocks on the unique index
        // and then fails, instead of applying the action a second time.
        const action = await AgentActionModel.create(
          { idempotencyKey, endpoint, requestHash, responseBody: { ref: '', detail: '' } },
          { transaction },
        );
        const applied = await apply(transaction, action.id);
        const response = { ref: `agent-action-${action.id}`, detail: applied.detail };
        await action.update({ responseBody: response, undoData: applied.undo }, { transaction });
        return response;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const winner = await AgentActionModel.findOne({ where: { idempotencyKey } });
        if (winner) return this.replay(winner, requestHash);
      }
      throw error;
    }
  }

  private replay(action: AgentActionModel, requestHash: string): AgentResult {
    if (action.requestHash !== requestHash) {
      throw HttpError.conflict('Idempotency-Key was already used with a different payload');
    }
    return action.responseBody;
  }

  // Runs the action in a transaction that is always rolled back: exact validation, nothing is kept,
  // and the idempotency key is not consumed.
  private async preview(handler: Handler, body: Record<string, unknown>): Promise<AgentResult> {
    let applied: Applied | undefined;
    try {
      await DatabaseProvider.getInstance().transaction(async (transaction) => {
        applied = await handler(body, transaction, null);
        throw DRY_RUN_ROLLBACK;
      });
    } catch (error) {
      if (error !== DRY_RUN_ROLLBACK) throw error;
    }
    return { ref: 'dry-run', detail: `dry run: ${applied?.detail ?? ''}` };
  }

  // ------------------------------------------------------------------ actions

  private async adjustInventory(body: Record<string, unknown>, transaction: Transaction): Promise<Applied> {
    const errors: string[] = [];
    const sku = toText(body.sku, 'sku', errors, { required: true, max: 255 });
    const target = ADJUSTMENT_STATUSES[asTrimmedString(body.new_status)];
    if (!target) errors.push(`new_status must be one of ${Object.keys(ADJUSTMENT_STATUSES).join(', ')}`);
    const reason = toText(body.reason, 'reason', errors);
    if (errors.length > 0) throw invalid(errors);

    const [product] = await lockProductsBySku([sku], transaction);
    const from = product.inventoryStatus;
    // A hold (quarantine, donation, recycling) is lifted by a person in the admin product page, never as a side
    // effect of an agent plan. The agent's own holds are undone through revert, which does not come here.
    if (target === 'available' && from !== 'available') {
      throw HttpError.conflict(`${sku} is on hold (${from}); an admin must release it before it can be restocked`);
    }
    await product.update({ inventoryStatus: target }, { transaction });
    return {
      detail: `${sku}: ${from} -> ${target}${reason ? ` (${reason})` : ''}`,
      undo: { kind: 'inventory', changes: [{ productId: product.id, sku, from, to: target }] },
    };
  }

  private async applyDiscount(
    body: Record<string, unknown>,
    transaction: Transaction,
    actionId: number | null,
  ): Promise<Applied> {
    const errors: string[] = [];
    const skus = toSkuList(body.skus, errors);
    const percent = Number(body.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > MAX_DISCOUNT_PERCENT) {
      errors.push(`percent must be a number in (0, ${MAX_DISCOUNT_PERCENT}]`);
    }
    const days = toInteger(body.duration_days);
    if (!days || days < 1 || days > MAX_DISCOUNT_DAYS) {
      errors.push(`duration_days must be an integer from 1 to ${MAX_DISCOUNT_DAYS}`);
    }
    if (errors.length > 0) throw invalid(errors);

    const products = await lockProductsBySku(skus, transaction);
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + (days as number) * DAY_MS);
    const discounts = await ProductDiscountModel.bulkCreate(
      products.map((product) => ({ productId: product.id, percent, startsAt, endsAt, agentActionId: actionId })),
      { transaction, returning: true },
    );
    return {
      detail: `${percent}% off ${products.length} SKU(s) until ${endsAt.toISOString()}`,
      undo: { kind: 'discount', discountIds: discounts.map((discount) => discount.id) },
    };
  }

  private async createTask(
    body: Record<string, unknown>,
    transaction: Transaction,
    actionId: number | null,
  ): Promise<Applied> {
    const errors: string[] = [];
    const title = toText(body.title, 'title', errors, { required: true, max: 255 });
    const assigneeRole = toText(body.assignee_role, 'assignee_role', errors, { required: true, max: 64 });
    const description = toText(body.description, 'description', errors);
    const dueInDays = body.due_in_days === null || body.due_in_days === undefined ? null : toInteger(body.due_in_days);
    if (dueInDays === undefined || (dueInDays !== null && (dueInDays < 0 || dueInDays > MAX_TASK_DUE_DAYS))) {
      errors.push(`due_in_days must be null or an integer from 0 to ${MAX_TASK_DUE_DAYS}`);
    }
    if (errors.length > 0) throw invalid(errors);

    const task = await AgentTaskModel.create(
      {
        title,
        assigneeRole,
        description: description || null,
        dueAt: dueInDays === null ? null : new Date(Date.now() + (dueInDays as number) * DAY_MS),
        agentActionId: actionId,
      },
      { transaction },
    );
    return { detail: `task #${task.id} for ${assigneeRole}: ${title}`, undo: { kind: 'task', taskId: task.id } };
  }

  private async switchChannel(body: Record<string, unknown>, transaction: Transaction): Promise<Applied> {
    const errors: string[] = [];
    const skus = toSkuList(body.skus, errors);
    const target = asTrimmedString(body.to_channel) as SalesChannel;
    if (!SALES_CHANNELS.includes(target)) errors.push(`to_channel must be one of ${SALES_CHANNELS.join(', ')}`);
    if (errors.length > 0) throw invalid(errors);

    const products = await lockProductsBySku(skus, transaction);
    const changes: ProductChange<SalesChannel>[] = [];
    for (const product of products) {
      changes.push({ productId: product.id, sku: product.sku, from: product.salesChannel, to: target });
      await product.update({ salesChannel: target }, { transaction });
    }
    return { detail: `${products.length} SKU(s) moved to ${target}`, undo: { kind: 'channel', changes } };
  }

  private async updateSopChecklist(
    body: Record<string, unknown>,
    transaction: Transaction,
    actionId: number | null,
  ): Promise<Applied> {
    const errors: string[] = [];
    const sopId = toText(body.sop_id, 'sop_id', errors, { required: true, max: 64 });
    const items = Array.isArray(body.add_items) ? body.add_items.map((item) => asTrimmedString(item)) : [];
    if (items.length === 0 || items.some((item) => !item)) errors.push('add_items must be a non-empty array of text');
    if (items.length > MAX_CHECKLIST_ITEMS) errors.push(`at most ${MAX_CHECKLIST_ITEMS} add_items per request`);
    if (items.some((item) => item.length > MAX_TEXT_LENGTH)) {
      errors.push(`each item must be at most ${MAX_TEXT_LENGTH} characters`);
    }
    if (errors.length > 0) throw invalid(errors);

    const created = await SopChecklistItemModel.bulkCreate(
      items.map((text) => ({ sopId, text, agentActionId: actionId })),
      { transaction, returning: true },
    );
    return {
      detail: `${created.length} item(s) added to ${sopId}`,
      undo: { kind: 'sop_items', itemIds: created.map((item) => item.id) },
    };
  }

  // ------------------------------------------------------------------ compensation

  private async applyUndo(undo: UndoData | null, transaction: Transaction): Promise<string> {
    if (!undo) return 'nothing to undo';
    const now = new Date();
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
        return `${ended} discount(s) ended`;
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
