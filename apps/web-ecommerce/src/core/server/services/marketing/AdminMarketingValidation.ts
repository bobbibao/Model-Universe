import HttpError from '../../../../shared/server/utils/HttpError';
import { MARKETING_CHANNELS, type MarketingDraftInput } from '../../../../shared/types/admin-marketing';
import { BodyReader, parseBody, type AdBody, type PostBody } from '../agent/AgentLimits';

export function parseDraft(raw: unknown): MarketingDraftInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw HttpError.badRequest('Bản nháp không hợp lệ.');
  const r = new BodyReader(raw as Record<string, unknown>);
  const text = (name: string, max: number) => r.string(name, { min: 0, max })?.trim() ?? '';
  const input: MarketingDraftInput = {
    name: r.string('name', { required: true, max: 255 })?.trim() ?? '',
    channel: r.oneOf('channel', MARKETING_CHANNELS, { required: true })!,
    objective: r.oneOf('objective', ['traffic', 'conversions'] as const) ?? 'traffic',
    brief: text('brief', 3000),
    audience: text('audience', 1000),
    tone: text('tone', 300),
    linkPath: text('linkPath', 500) || '/',
    sku: text('sku', 255),
    assetId: r.number('assetId', { min: 1, integer: true }),
    scheduledAt: r.dateTime('scheduledAt')?.toISOString(),
    startsAt: r.dateTime('startsAt')?.toISOString(),
    dailyBudgetVnd: r.number('dailyBudgetVnd', { min: 0, max: 1_000_000_000, integer: true }) ?? 100000,
    durationDays: r.number('durationDays', { min: 1, max: 30, integer: true }) ?? 7,
    message: text('message', 5000),
    headline: text('headline', 40),
    primaryText: text('primaryText', 2000),
    headlines: r.strings('headlines', { maxItems: 15, min: 0, max: 30 }) ?? [],
    descriptions: r.strings('descriptions', { maxItems: 4, min: 0, max: 90 }) ?? [],
    keywords: r.strings('keywords', { maxItems: 50, min: 0, max: 80 }) ?? [],
    adText: text('adText', 100),
  };
  for (const key of ['headlines', 'descriptions', 'keywords'] as const)
    input[key] = input[key].map((value) => value.trim()).filter(Boolean);
  if (!input.name) r.errors.push('Cần nhập tên chiến dịch.');
  if (!/^\/(?!\/)[^\s\\]*$/.test(input.linkPath)) r.errors.push('Link phải là đường dẫn trong cửa hàng, ví dụ /shop.');
  if (r.unknown().length) r.errors.push('Bản nháp chứa trường không hợp lệ.');
  if (r.errors.length) throw HttpError.badRequest(r.errors.join(' '));
  return input;
}

export function publishBody(input: MarketingDraftInput, ref: string, now = new Date()): PostBody | AdBody {
  const schedule = input.channel === 'facebook' ? input.scheduledAt : input.startsAt;
  if (schedule) {
    const delay = new Date(schedule).getTime() - now.getTime();
    const minimum = input.channel === 'facebook' ? 10 * 60_000 : 0;
    if (delay < minimum || delay > 30 * 86400_000)
      throw HttpError.badRequest('Lịch phải ở tương lai, tối đa 30 ngày; bài post cần cách hiện tại ít nhất 10 phút.');
  }
  if (input.dailyBudgetVnd * input.durationDays > 1_000_000_000)
    throw HttpError.badRequest('Tổng ngân sách không được vượt 1 tỷ VND.');
  const raw =
    input.channel === 'facebook'
      ? {
          ref: `${ref}-post`,
          campaign_ref: ref,
          message: input.message,
          link_path: input.linkPath,
          sku: input.sku || undefined,
          asset_id: input.assetId,
          scheduled_at: input.scheduledAt,
        }
      : {
          ref: `${ref}-ad`,
          campaign_ref: ref,
          platform: input.channel,
          objective: input.objective,
          daily_budget_vnd: input.dailyBudgetVnd,
          duration_days: input.durationDays,
          starts_at: input.startsAt,
          link_path: input.linkPath,
          sku: input.sku || undefined,
          asset_id: input.assetId,
          headline: input.headline || undefined,
          primary_text: input.primaryText || undefined,
          headlines: input.headlines,
          descriptions: input.descriptions,
          keywords: input.keywords,
          ad_text: input.adText || undefined,
        };
  const parsed = parseBody(input.channel === 'facebook' ? 'marketing/posts' : 'marketing/ads', raw);
  if (parsed.errors.length) throw HttpError.badRequest(`Nội dung chưa đủ để gửi: ${parsed.errors.join(' ')}`);
  return parsed.body as PostBody | AdBody;
}
