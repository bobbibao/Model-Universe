import { Op, WhereOptions } from 'sequelize';
import ContactMessageModel, { ContactMessageStatus } from '../database/client/models/ContactMessage.Model';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import {
  asTrimmedString,
  isNonEmpty,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
} from '../../../shared/server/utils/ValidationUtils';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_FIELD_LENGTH = 120;
const MIN_MESSAGE_LENGTH = 10;
const STATUSES: ContactMessageStatus[] = ['NEW', 'HANDLED'];

export default class ContactMessageService implements BaseServiceInterface<ContactMessageModel> {
  findByPk(id: string | number): Promise<ContactMessageModel | null> {
    return ContactMessageModel.findByPk(id);
  }

  findAll(): Promise<ContactMessageModel[]> {
    return ContactMessageModel.findAll({ order: [['createdAt', 'DESC']] });
  }

  insert(data: Record<string, unknown>): Promise<ContactMessageModel> {
    return this.create(data);
  }

  bulkInsert(): Promise<ContactMessageModel[] | null> {
    throw new Error('Method not implemented.');
  }

  async create(data: Record<string, unknown>): Promise<ContactMessageModel> {
    const values = {
      name: asTrimmedString(data.name),
      email: normalizeEmail(data.email),
      phone: asTrimmedString(data.phone) || null,
      company: asTrimmedString(data.company) || null,
      message: asTrimmedString(data.message),
    };
    const errors: string[] = [];
    if (!values.name) errors.push('Vui lòng nhập họ tên.');
    if (!isValidEmail(values.email)) errors.push('Email không hợp lệ.');
    if (values.phone && !isValidPhone(values.phone)) errors.push('Số điện thoại không hợp lệ.');
    if ([values.name, values.company || ''].some((value) => value.length > MAX_FIELD_LENGTH)) {
      errors.push(`Họ tên và công ty tối đa ${MAX_FIELD_LENGTH} ký tự.`);
    }
    if (!isNonEmpty(values.message, MIN_MESSAGE_LENGTH))
      errors.push(`Nội dung phải có ít nhất ${MIN_MESSAGE_LENGTH} ký tự.`);
    if (values.message.length > MAX_MESSAGE_LENGTH) errors.push(`Nội dung tối đa ${MAX_MESSAGE_LENGTH} ký tự.`);
    if (errors.length > 0) throw HttpError.badRequest('Thông tin liên hệ chưa hợp lệ.', errors);
    return ContactMessageModel.create(values);
  }

  async list({ q, status, limit, offset }: { q?: string; status?: string; limit: number; offset: number }) {
    const conditions: WhereOptions[] = [];
    if (status && STATUSES.includes(status as ContactMessageStatus)) conditions.push({ status });
    const search = asTrimmedString(q);
    if (search) {
      conditions.push({
        [Op.or]: ['name', 'email', 'phone', 'message'].map((column) => ({ [column]: { [Op.iLike]: `%${search}%` } })),
      });
    }
    return ContactMessageModel.findAndCountAll({
      where: { [Op.and]: conditions },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
  }

  async updateStatus(id: number, rawStatus: unknown): Promise<ContactMessageModel> {
    const status = asTrimmedString(rawStatus) as ContactMessageStatus;
    if (!STATUSES.includes(status)) throw HttpError.badRequest('Trạng thái không hợp lệ.');
    const message = await ContactMessageModel.findByPk(id);
    if (!message) throw HttpError.notFound('Không tìm thấy tin nhắn liên hệ.');
    return message.update({ status });
  }
}
