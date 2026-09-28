import { Op, WhereOptions } from 'sequelize';
import SupplierModel from '../database/client/models/Supplier.Model';
import ProductModel from '../database/client/models/Product.Model';
import StockImportModel from '../database/client/models/StockImport.Model';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, isHttpUrl, isValidEmail, isValidPhone } from '../../../shared/server/utils/ValidationUtils';

export interface SupplierListQuery {
  q?: string;
  status?: string;
  limit: number;
  offset: number;
  sortKey?: string;
  sortDirection?: string;
}

const SORTABLE_COLUMNS = ['id', 'name', 'contactName', 'createdAt'];

export default class SupplierService implements BaseServiceInterface<SupplierModel> {
  findByPk(id: string | number): Promise<SupplierModel | null> {
    return SupplierModel.findByPk(id);
  }

  findAll(): Promise<SupplierModel[]> {
    return SupplierModel.findAll({ order: [['name', 'ASC']] });
  }

  insert(data: Record<string, unknown>): Promise<SupplierModel> {
    return this.create(data);
  }

  bulkInsert(): Promise<SupplierModel[] | null> {
    throw new Error('Method not implemented.');
  }

  async list({ q, status, limit, offset, sortKey, sortDirection }: SupplierListQuery) {
    const where: WhereOptions = {};
    const search = asTrimmedString(q);
    if (search) {
      Object.assign(where, {
        [Op.or]: ['name', 'contactName', 'contactEmail', 'contactPhone'].map((column) => ({
          [column]: { [Op.iLike]: `%${search}%` },
        })),
      });
    }
    if (status === 'active') Object.assign(where, { isActive: true });
    if (status === 'inactive') Object.assign(where, { isActive: false });
    const column = sortKey && SORTABLE_COLUMNS.includes(sortKey) ? sortKey : 'id';
    const direction = sortDirection === 'desc' ? 'DESC' : 'ASC';
    return SupplierModel.findAndCountAll({ where, limit, offset, order: [[column, direction]] });
  }

  // Active suppliers for select inputs.
  async options() {
    return SupplierModel.findAll({
      attributes: ['id', 'name', 'contactPhone'],
      where: { isActive: true },
      order: [['name', 'ASC']],
    });
  }

  private validate(data: Record<string, unknown>) {
    const values = {
      name: asTrimmedString(data.name),
      contactName: asTrimmedString(data.contactName) || null,
      contactPhone: asTrimmedString(data.contactPhone) || null,
      contactEmail: asTrimmedString(data.contactEmail).toLowerCase() || null,
      website: asTrimmedString(data.website) || null,
      logo: asTrimmedString(data.logo) || null,
      isActive: data.isActive === undefined ? true : data.isActive === true,
    };
    const errors: string[] = [];
    if (!values.name) errors.push('Tên nhà cung cấp không được để trống.');
    if (values.contactPhone && !isValidPhone(values.contactPhone)) errors.push('Số điện thoại không hợp lệ.');
    if (values.contactEmail && !isValidEmail(values.contactEmail)) errors.push('Email không hợp lệ.');
    if (values.website && !isHttpUrl(values.website)) errors.push('Website phải bắt đầu bằng http:// hoặc https://.');
    if (errors.length > 0) throw HttpError.badRequest('Thông tin nhà cung cấp chưa hợp lệ.', errors);
    return values;
  }

  async create(data: Record<string, unknown>): Promise<SupplierModel> {
    return SupplierModel.create(this.validate(data));
  }

  async update(id: number, data: Record<string, unknown>): Promise<SupplierModel> {
    const supplier = await SupplierModel.findByPk(id);
    if (!supplier) throw HttpError.notFound('Không tìm thấy nhà cung cấp.');
    return supplier.update(this.validate(data));
  }

  async remove(id: number): Promise<void> {
    const supplier = await SupplierModel.findByPk(id);
    if (!supplier) throw HttpError.notFound('Không tìm thấy nhà cung cấp.');
    if ((await ProductModel.count({ where: { supplierId: id } })) > 0) {
      throw HttpError.conflict('Nhà cung cấp đang có sản phẩm, hãy chuyển sang trạng thái ngừng hoạt động.');
    }
    if ((await StockImportModel.count({ where: { supplierId: id } })) > 0) {
      throw HttpError.conflict('Nhà cung cấp đã có lịch sử nhập kho, hãy chuyển sang trạng thái ngừng hoạt động.');
    }
    await supplier.destroy();
  }
}
