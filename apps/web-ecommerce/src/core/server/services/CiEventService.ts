import CiEventModel from '../database/client/models/CiEvent.Model';
import CiNotificationModel from '../database/client/models/CiNotification.Model';
import DatabaseProvider from '../database/Database.Provider';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';

// Event types of packages/contracts/events/web-events.schema.json.
const EVENT_TYPES = new Set([
  'improvement.detected',
  'improvement.status_changed',
  'finding.recorded',
  'question.opened',
  'question.answered',
  'action.executed',
  'action.failed',
  'measurement.completed',
  'case.learned',
  'notification.created',
]);

const MAX_EVENTS_PER_BATCH = 500;
const NOTIFICATION_LIMIT = 20;

// A type alias (not an interface) so that it is accepted as a row by Model.bulkCreate.
type ParsedEvent = {
  type: string;
  improvementId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

const parseEvents = (body: unknown): ParsedEvent[] => {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) throw HttpError.badRequest('Body must be { "events": [...] }');
  if (events.length > MAX_EVENTS_PER_BATCH)
    throw HttpError.badRequest(`At most ${MAX_EVENTS_PER_BATCH} events per batch`);
  const errors: string[] = [];
  const parsed = events.map((event, index): ParsedEvent => {
    const type = asTrimmedString(event?.type);
    const improvementId = asTrimmedString(event?.improvement_id);
    const occurredAt = new Date(asTrimmedString(event?.occurred_at));
    const payload = event?.payload;
    if (!EVENT_TYPES.has(type)) errors.push(`events[${index}].type is not a known event type`);
    if (!improvementId) errors.push(`events[${index}].improvement_id is required`);
    if (isNaN(occurredAt.getTime())) errors.push(`events[${index}].occurred_at must be a date-time`);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      errors.push(`events[${index}].payload must be an object`);
    }
    return { type, improvementId, occurredAt, payload: payload as Record<string, unknown> };
  });
  if (errors.length > 0) throw HttpError.badRequest('Invalid event batch', errors);
  return parsed;
};

// `notification.created` payload (agent: infrastructure/notifications/web_inbox.py). The signed answer-link
// token is deliberately not stored.
const toNotification = (event: ParsedEvent) => {
  const p = event.payload;
  const notificationId = asTrimmedString(p.notification_id);
  const recipientId = asTrimmedString(p.recipient_id);
  if (!notificationId || !recipientId) return null;
  return {
    notificationId,
    improvementId: event.improvementId,
    kind: asTrimmedString(p.kind) || 'unknown',
    recipientId,
    title: asTrimmedString(p.title),
    body: asTrimmedString(p.body),
    severity: asTrimmedString(p.severity) || 'low',
    questionId: asTrimmedString(p.question_id) || null,
    linkPath: asTrimmedString(p.link_path) || null,
    createdAt: event.occurredAt,
  };
};

export default class CiEventService {
  async ingest(body: unknown): Promise<{ received: number }> {
    const events = parseEvents(body);
    const notifications = events
      .filter((event) => event.type === 'notification.created')
      .map(toNotification)
      .filter((notification): notification is NonNullable<typeof notification> => notification !== null);
    await DatabaseProvider.getInstance().transaction(async (transaction) => {
      await CiEventModel.bulkCreate(events, { transaction });
      // Delivery is at-least-once, so a notification that was already stored is skipped.
      await CiNotificationModel.bulkCreate(notifications, { transaction, ignoreDuplicates: true });
    });
    return { received: events.length };
  }

  async listNotifications(recipientId: string) {
    const [items, unread] = await Promise.all([
      CiNotificationModel.findAll({
        where: { recipientId },
        order: [['createdAt', 'DESC']],
        limit: NOTIFICATION_LIMIT,
      }),
      CiNotificationModel.count({ where: { recipientId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markAllRead(recipientId: string): Promise<void> {
    await CiNotificationModel.update({ readAt: new Date() }, { where: { recipientId, readAt: null } });
  }
}
