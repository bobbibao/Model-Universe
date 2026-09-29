import { literal } from 'sequelize';
import CategoryModel from '../database/client/models/Category.Model';
import ProductModel from '../database/client/models/Product.Model';
import { BaseServiceInterface } from './BaseServiceInterface';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';
import { toSlug } from '../../../shared/client/utils/toSlug';

const productCount = (onlyVisible: boolean) =>
  literal(
    `(SELECT COUNT(*)::int FROM "product" AS p WHERE p."categoryId" = "CategoryModel"."id"${
      onlyVisible ? ` AND p."isArchived" = false AND p."inventoryStatus" = 'available'` : ''
    })`,
  );

export default class CategoryService implements BaseServiceInterface<CategoryModel> {
  findByPk(id: string | number): Promise<CategoryModel | null> {
    return CategoryModel.findByPk(id);
  }

  findAll(): Promise<CategoryModel[]> {
    return CategoryModel.findAll({ order: [['name', 'ASC']] });
  }

  insert(data: Record<string, unknown>): Promise<CategoryModel> {
    return this.create(data);
  }

  bulkInsert(): Promise<CategoryModel[] | null> {
    throw new Error('Method not implemented.');
  }

  // Storefront: categories with the number of visible products.
  async listPublic() {
    return CategoryModel.findAll({
      attributes: ['id', 'name', 'slug', [productCount(true), 'productCount']],
      order: [['name', 'ASC']],
    });
  }

  // Admin: categories with the number of products, archived ones included.
  async listAdmin() {
    return CategoryModel.findAll({
      attributes: ['id', 'name', 'slug', 'createdAt', [productCount(false), 'productCount']],
      order: [['id', 'ASC']],
    });
  }

  private async validate(data: Record<string, unknown>, currentId?: number) {
    const name = asTrimmedString(data.name);
    const slug = toSlug(asTrimmedString(data.slug) || name);
    if (!name) throw HttpError.badRequest('Tên danh mục không được để trống.');
    if (!slug) throw HttpError.badRequest('Đường dẫn (slug) không hợp lệ.');
    const existing = await CategoryModel.findOne({ where: { slug } });
    if (existing && existing.id !== currentId) throw HttpError.conflict('Đường dẫn (slug) đã được sử dụng.');
    return { name, slug };
  }

  async create(data: Record<string, unknown>): Promise<CategoryModel> {
    return CategoryModel.create(await this.validate(data));
  }

  async update(id: number, data: Record<string, unknown>): Promise<CategoryModel> {
    const category = await CategoryModel.findByPk(id);
    if (!category) throw HttpError.notFound('Không tìm thấy danh mục.');
    return category.update(await this.validate(data, id));
  }

  async remove(id: number): Promise<void> {
    const category = await CategoryModel.findByPk(id);
    if (!category) throw HttpError.notFound('Không tìm thấy danh mục.');
    if ((await ProductModel.count({ where: { categoryId: id } })) > 0) {
      throw HttpError.conflict('Danh mục đang có sản phẩm, không thể xoá.');
    }
    await category.destroy();
  }
}
