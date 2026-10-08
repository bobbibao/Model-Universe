import { Op } from 'sequelize';
import StockImportModel from '../database/client/models/StockImport.Model';
import StockImportItemModel from '../database/client/models/StockImportItem.Model';
import ProductModel from '../database/client/models/Product.Model';
import SupplierModel from '../database/client/models/Supplier.Model';
import UserModel from '../database/internal/models/User.Model';
import DatabaseProvider from '../database/Database.Provider';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';

const MAX_LINES = 50;
const MAX_QUANTITY = 100000;
const MAX_NOTE_LENGTH = 500;

const supplierInclude = { model: SupplierModel, as: 'supplier', attributes: ['id', 'name', 'contactPhone'] };
const creatorInclude = { model: UserModel, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] };
const itemsInclude = {
  model: StockImportItemModel,
  as: 'items',
  include: [{ model: ProductModel, as: 'product', attributes: ['id', 'name', 'sku', 'imageUrl'] }],
};

export default class StockImportService implements BaseServiceInterface<StockImportModel> {
  findByPk(id: string | number): Promise<StockImportModel | null> {
    return StockImportModel.findByPk(id);
  }

  findAll(): Promise<StockImportModel[]> {
    return StockImportModel.findAll({ order: [['createdAt', 'DESC']] });
  }

  insert(): Promise<StockImportModel | null> {
    throw new Error('Use StockImportService.create to record stock imports.');
  }

  bulkInsert(): Promise<StockImportModel[] | null> {
    throw new Error('Method not implemented.');
  }

  async list(limit: number, offset: number, supplierId?: number) {
    return StockImportModel.findAndCountAll({
      where: supplierId ? { supplierId } : {},
      include: [supplierInclude, creatorInclude, itemsInclude],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
  }

  async get(id: number) {
    const stockImport = await StockImportModel.findByPk(id, {
      include: [supplierInclude, creatorInclude, itemsInclude],
    });
    if (!stockImport) throw HttpError.notFound('Không tìm thấy phiếu nhập kho.');
    return stockImport;
  }

  // Records a goods receipt: adds the quantities to the product stock and keeps the latest import price
  // as the product cost, in one transaction.
  async create(createdBy: number, data: Record<string, unknown>) {
    const supplierId = toInteger(data.supplierId);
    const note = asTrimmedString(data.note) || null;
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const errors: string[] = [];

    const items = rawItems.map((raw, index) => {
      const productId = toInteger(raw?.productId);
      const quantity = toInteger(raw?.quantity);
      const importPrice = toInteger(raw?.importPrice);
      const row = `Dòng ${index + 1}`;
      if (!productId) errors.push(`${row}: vui lòng chọn sản phẩm.`);
      if (!quantity || quantity < 1 || quantity > MAX_QUANTITY) {
        errors.push(`${row}: số lượng phải từ 1 đến ${MAX_QUANTITY}.`);
      }
      if (importPrice === undefined || importPrice < 0) errors.push(`${row}: giá nhập phải là số nguyên không âm.`);
      return { productId: productId as number, quantity: quantity as number, importPrice: importPrice as number };
    });
    if (items.length === 0) errors.push('Vui lòng thêm ít nhất một sản phẩm.');
    if (items.length > MAX_LINES) errors.push(`Tối đa ${MAX_LINES} sản phẩm mỗi phiếu nhập.`);
    const productIds = items.map((item) => item.productId).filter(Boolean);
    if (new Set(productIds).size !== productIds.length) errors.push('Mỗi sản phẩm chỉ được xuất hiện một lần.');
    if ((note?.length || 0) > MAX_NOTE_LENGTH) errors.push(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);

    const supplier = supplierId ? await SupplierModel.findByPk(supplierId) : null;
    if (!supplier) errors.push('Vui lòng chọn nhà cung cấp.');
    else if (!supplier.isActive) errors.push('Nhà cung cấp đã ngừng hợp tác.');
    if (errors.length > 0) throw HttpError.badRequest('Thông tin nhập kho chưa hợp lệ.', errors);

    const stockImportId = await DatabaseProvider.getInstance().transaction(async (transaction) => {
      const products = await ProductModel.findAll({
        where: { id: { [Op.in]: productIds } },
        order: [['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (products.length !== productIds.length) throw HttpError.badRequest('Có sản phẩm không tồn tại.');
      if (products.some(product => product.partnerId)) throw HttpError.conflict('Partner inventory belongs to its seller listing workflow.', 'PARTNER_LISTING_REQUIRED');
      const productById = new Map(products.map((product) => [product.id, product]));

      const stockImport = await StockImportModel.create(
        {
          supplierId,
          createdBy,
          note,
          totalCost: items.reduce((sum, item) => sum + item.quantity * item.importPrice, 0),
        },
        { transaction },
      );
      await StockImportItemModel.bulkCreate(
        items.map((item) => ({ ...item, stockImportId: stockImport.id })),
        { transaction },
      );
      for (const item of items) {
        const product = productById.get(item.productId) as ProductModel;
        await product.update({ stock: product.stock + item.quantity, importPrice: item.importPrice }, { transaction });
      }
      return stockImport.id;
    });
    return this.get(stockImportId);
  }
}
