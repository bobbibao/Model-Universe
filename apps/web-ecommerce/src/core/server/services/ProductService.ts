import { FindOptions, Op, Order, Transaction, UniqueConstraintError, WhereOptions, col, fn } from 'sequelize';
import ProductModel, { ProductGender } from '../database/client/models/Product.Model';
import ProductImageModel from '../database/client/models/ProductImage.Model';
import CategoryModel from '../database/client/models/Category.Model';
import SupplierModel from '../database/client/models/Supplier.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import StockImportItemModel from '../database/client/models/StockImportItem.Model';
import DatabaseProvider from '../database/Database.Provider';
import { BaseServiceInterface } from './BaseServiceInterface';
import ReviewService from './ReviewService';
import FileStorageService, { PUBLIC_UPLOAD_PREFIX } from './FileStorageService';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, isHttpUrl, toInteger } from '../../../shared/server/utils/ValidationUtils';

export interface ProductListQuery {
  q?: string;
  category?: string;
  categoryId?: number;
  gender?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  status?: string;
  sort?: string;
  limit: number;
  offset: number;
}

const GENDERS: ProductGender[] = ['male', 'female', 'unisex'];
const MAX_GALLERY_IMAGES = 10;
const MAX_SIZES = 30;

const PUBLIC_SORTS: Record<string, Order> = {
  newest: [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ],
  price_asc: [['price', 'ASC']],
  price_desc: [['price', 'DESC']],
  name: [['name', 'ASC']],
  best_selling: [['sold', 'DESC']],
  rating: [['rating', 'DESC']],
};

const ADMIN_SORTABLE_COLUMNS = ['id', 'name', 'price', 'stock', 'sold', 'createdAt'];

// Fields shown on product cards (cost price and supplier stay internal).
const LIST_ATTRIBUTES = [
  'id',
  'name',
  'brandName',
  'gender',
  'price',
  'stock',
  'imageUrl',
  'rating',
  'reviewCount',
  'isFeatured',
];

const categoryInclude = { model: CategoryModel, as: 'category', attributes: ['id', 'name', 'slug'] };
const imagesInclude = { model: ProductImageModel, as: 'images', attributes: ['id', 'url', 'sortOrder'] };

const isImageUrl = (url: string) => url.startsWith(`${PUBLIC_UPLOAD_PREFIX}/`) || isHttpUrl(url);

const galleryUrls = (product: ProductModel): string[] =>
  ((product.get('images') as ProductImageModel[] | undefined) || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => image.url);

export default class ProductService implements BaseServiceInterface<ProductModel> {
  private reviewService = new ReviewService();
  private fileStorageService = new FileStorageService();

  findByPk(id: string | number): Promise<ProductModel | null> {
    return ProductModel.findByPk(id);
  }

  findAll(filter?: FindOptions): Promise<ProductModel[]> {
    return ProductModel.findAll(filter);
  }

  insert(data: Record<string, unknown>): Promise<ProductModel> {
    return this.create(data);
  }

  bulkInsert(): Promise<ProductModel[] | null> {
    throw new Error('Method not implemented.');
  }

  private buildWhere(query: ProductListQuery): WhereOptions {
    const conditions: WhereOptions[] = [];
    const search = asTrimmedString(query.q);
    if (search) {
      conditions.push({
        [Op.or]: ['name', 'brandName', 'sku'].map((column) => ({ [column]: { [Op.iLike]: `%${search}%` } })),
      });
    }
    if (query.gender && GENDERS.includes(query.gender as ProductGender)) conditions.push({ gender: query.gender });
    if (query.brand) conditions.push({ brandName: query.brand });
    if (query.categoryId) conditions.push({ categoryId: query.categoryId });
    if (query.minPrice !== undefined) conditions.push({ price: { [Op.gte]: query.minPrice } });
    if (query.maxPrice !== undefined) conditions.push({ price: { [Op.lte]: query.maxPrice } });
    if (query.inStock) conditions.push({ stock: { [Op.gt]: 0 } });
    if (query.featured) conditions.push({ isFeatured: true });
    return { [Op.and]: conditions };
  }

  // Storefront listing: archived products are never returned.
  async listPublic(query: ProductListQuery) {
    const where = { [Op.and]: [this.buildWhere(query), { isArchived: false }] };
    const include = query.category
      ? [{ ...categoryInclude, where: { slug: query.category }, required: true }]
      : [categoryInclude];
    return ProductModel.findAndCountAll({
      attributes: LIST_ATTRIBUTES,
      where,
      include,
      order: PUBLIC_SORTS[query.sort || ''] || PUBLIC_SORTS.newest,
      limit: query.limit,
      offset: query.offset,
      distinct: true,
    });
  }

  // Values for the storefront filter bar.
  async getFilterOptions() {
    const brands = await ProductModel.findAll({
      attributes: [[fn('DISTINCT', col('brandName')), 'brandName']],
      where: { isArchived: false },
      order: [['brandName', 'ASC']],
      raw: true,
    });
    const prices = (await ProductModel.findOne({
      attributes: [
        [fn('MIN', col('price')), 'min'],
        [fn('MAX', col('price')), 'max'],
      ],
      where: { isArchived: false },
      raw: true,
    })) as unknown as { min: number | null; max: number | null } | null;
    return {
      brands: brands.map((row) => row.brandName),
      priceRange: { min: Number(prices?.min || 0), max: Number(prices?.max || 0) },
    };
  }

  async getPublicById(id: number) {
    const product = await ProductModel.findOne({
      attributes: { exclude: ['importPrice', 'supplierId', 'isArchived'] },
      where: { id, isArchived: false },
      include: [categoryInclude, imagesInclude],
    });
    if (!product) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    return {
      ...product.get({ plain: true }),
      images: galleryUrls(product),
      ratingDistribution: await this.reviewService.getDistribution(id),
    };
  }

  async getReviews(productId: number, limit: number, offset: number) {
    const exists = await ProductModel.count({ where: { id: productId, isArchived: false } });
    if (!exists) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    return this.reviewService.listByProduct(productId, limit, offset);
  }

  async listAdmin(query: ProductListQuery & { sortKey?: string; sortDirection?: string }) {
    const conditions: WhereOptions[] = [this.buildWhere(query)];
    if (query.status === 'active') conditions.push({ isArchived: false });
    if (query.status === 'archived') conditions.push({ isArchived: true });
    if (query.status === 'featured') conditions.push({ isFeatured: true });
    const column = query.sortKey && ADMIN_SORTABLE_COLUMNS.includes(query.sortKey) ? query.sortKey : 'id';
    return ProductModel.findAndCountAll({
      attributes: [...LIST_ATTRIBUTES, 'sku', 'sold', 'importPrice', 'isArchived', 'createdAt'],
      where: { [Op.and]: conditions },
      include: [categoryInclude],
      order: [[column, query.sortDirection === 'desc' ? 'DESC' : 'ASC']],
      limit: query.limit,
      offset: query.offset,
      distinct: true,
    });
  }

  async getAdminById(id: number) {
    const product = await ProductModel.findByPk(id, {
      include: [
        categoryInclude,
        imagesInclude,
        { model: SupplierModel, as: 'supplier', attributes: ['id', 'name', 'contactPhone'] },
      ],
    });
    if (!product) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    return { ...product.get({ plain: true }), images: galleryUrls(product) };
  }

  // Validates the admin form payload; returns the product columns and the gallery image URLs.
  private async validate(data: Record<string, unknown>, currentId?: number) {
    const errors: string[] = [];
    const name = asTrimmedString(data.name);
    const brandName = asTrimmedString(data.brandName);
    const sku = asTrimmedString(data.sku);
    const imageUrl = asTrimmedString(data.imageUrl);
    const price = toInteger(data.price);
    const importPrice = toInteger(data.importPrice) ?? 0;
    const stock = toInteger(data.stock) ?? 0;
    const categoryId = toInteger(data.categoryId);
    const supplierId = toInteger(data.supplierId);
    const gender = data.gender as ProductGender;
    const rawSizes = Array.isArray(data.availableSizes)
      ? data.availableSizes
      : asTrimmedString(data.availableSizes).split(',');
    const availableSizes = Array.from(new Set(rawSizes.map((size) => asTrimmedString(String(size))).filter(Boolean)));
    const images = Array.isArray(data.images) ? data.images.map((url) => asTrimmedString(url)).filter(Boolean) : [];
    const productionDate = asTrimmedString(data.productionDate) ? new Date(asTrimmedString(data.productionDate)) : null;

    if (!name) errors.push('Tên sản phẩm không được để trống.');
    if (!brandName) errors.push('Thương hiệu không được để trống.');
    if (!sku) errors.push('SKU không được để trống.');
    if (!GENDERS.includes(gender)) errors.push('Giới tính của sản phẩm không hợp lệ.');
    if (price === undefined || price <= 0) errors.push('Giá bán phải là số nguyên lớn hơn 0.');
    if (importPrice < 0) errors.push('Giá nhập không được âm.');
    if (stock < 0) errors.push('Số lượng tồn kho không được âm.');
    if (availableSizes.length > MAX_SIZES) errors.push(`Tối đa ${MAX_SIZES} kích thước.`);
    if (!imageUrl || !isImageUrl(imageUrl)) errors.push('Vui lòng chọn ảnh chính cho sản phẩm.');
    if (images.length > MAX_GALLERY_IMAGES) errors.push(`Tối đa ${MAX_GALLERY_IMAGES} ảnh phụ.`);
    if (images.some((url) => !isImageUrl(url))) errors.push('Đường dẫn ảnh phụ không hợp lệ.');
    if (productionDate && isNaN(productionDate.getTime())) errors.push('Ngày nhập không hợp lệ.');
    if (!categoryId || !(await CategoryModel.findByPk(categoryId))) errors.push('Vui lòng chọn danh mục hợp lệ.');
    if (supplierId && !(await SupplierModel.findByPk(supplierId))) errors.push('Nhà cung cấp không hợp lệ.');
    if (errors.length > 0) throw HttpError.badRequest('Thông tin sản phẩm chưa hợp lệ.', errors);

    const duplicate = await ProductModel.findOne({ where: { sku } });
    if (duplicate && duplicate.id !== currentId) throw HttpError.conflict('SKU đã tồn tại.');

    return {
      values: {
        name,
        brandName,
        sku,
        description: asTrimmedString(data.description) || null,
        gender,
        availableSizes,
        price: price as number,
        importPrice,
        stock,
        imageUrl,
        categoryId: categoryId as number,
        supplierId: supplierId || null,
        weight: asTrimmedString(data.weight) || null,
        dimensions: asTrimmedString(data.dimensions) || null,
        productionDate,
        isFeatured: data.isFeatured === true,
        isArchived: data.isArchived === true,
      },
      images,
    };
  }

  private async replaceImages(productId: number, images: string[], transaction: Transaction) {
    await ProductImageModel.destroy({ where: { productId }, transaction });
    await ProductImageModel.bulkCreate(
      images.map((url, sortOrder) => ({ productId, url, sortOrder })),
      { transaction },
    );
  }

  async create(data: Record<string, unknown>) {
    const { values, images } = await this.validate(data);
    try {
      const product = await DatabaseProvider.getInstance().transaction(async (transaction) => {
        const created = await ProductModel.create(values, { transaction });
        await this.replaceImages(created.id, images, transaction);
        return created;
      });
      return this.getAdminById(product.id);
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw HttpError.conflict('SKU đã tồn tại.');
      throw error;
    }
  }

  async update(id: number, data: Record<string, unknown>) {
    const product = await ProductModel.findByPk(id, { include: [imagesInclude] });
    if (!product) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    const previousFiles = [product.imageUrl, ...galleryUrls(product)];
    const { values, images } = await this.validate(data, id);
    try {
      await DatabaseProvider.getInstance().transaction(async (transaction) => {
        await product.update(values, { transaction });
        await this.replaceImages(id, images, transaction);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw HttpError.conflict('SKU đã tồn tại.');
      throw error;
    }
    // Uploaded files that are no longer used by the product are removed from disk.
    const currentFiles = new Set([values.imageUrl, ...images]);
    await this.fileStorageService.removeFiles(previousFiles.filter((url) => !currentFiles.has(url)));
    return this.getAdminById(id);
  }

  // Products that appear in orders or stock imports are archived instead of deleted (history keeps pointing at them).
  async remove(id: number): Promise<{ archived: boolean }> {
    const product = await ProductModel.findByPk(id, { include: [imagesInclude] });
    if (!product) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    const hasHistory =
      (await OrderItemModel.count({ where: { productId: id } })) > 0 ||
      (await StockImportItemModel.count({ where: { productId: id } })) > 0;
    if (hasHistory) {
      await product.update({ isArchived: true, isFeatured: false });
      return { archived: true };
    }
    const files = [product.imageUrl, ...galleryUrls(product)];
    await product.destroy();
    await this.fileStorageService.removeFiles(files);
    return { archived: false };
  }
}
