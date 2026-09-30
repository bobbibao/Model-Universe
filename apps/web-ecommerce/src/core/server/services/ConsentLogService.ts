import ConsentLogModel from '../database/client/models/ConsentLog.Model';
import HttpError from '../../../shared/server/utils/HttpError';

// Records a visitor's cookie choice (the banner also stores it in the `consent` cookie). No identifier is kept.
export default class ConsentLogService {
  async record(data: Record<string, unknown>): Promise<void> {
    if (typeof data.analytics !== 'boolean' || typeof data.marketing !== 'boolean') {
      throw HttpError.badRequest('Lựa chọn cookie không hợp lệ.');
    }
    await ConsentLogModel.create({ analytics: data.analytics, marketing: data.marketing });
  }
}
