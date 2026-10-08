import LoyaltyGiftModel from '../database/client/models/LoyaltyGift.Model';
import LoyaltyRedemptionModel from '../database/client/models/LoyaltyRedemption.Model';
import ReturnEventModel from '../database/client/models/ReturnEvent.Model';
import BuybackRequestModel from '../database/client/models/BuybackRequest.Model';
import PawnContractModel from '../database/client/models/PawnContract.Model';
import { FindOptions, Op, Order, Transaction, UniqueConstraintError, WhereOptions, col, fn } from 'sequelize';
import ProductModel, {
  INVENTORY_STATUSES,
  InventoryStatus,
  ProductGender,
  SALES_CHANNELS,
  STOREFRONT_VISIBLE,
  SalesChannel,
} from '../database/client/models/Product.Model';
import ProductImageModel from '../database/client/models/ProductImage.Model';
import CategoryModel from '../database/client/models/Category.Model';
import SupplierModel from '../database/client/models/Supplier.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import ReservationModel from '../database/client/models/Reservation.Model';
import StockImportItemModel from '../database/client/models/StockImportItem.Model';
import DatabaseProvider from '../database/Database.Provider';
import { BaseServiceInterface } from './BaseServiceInterface';
import ReviewService from './ReviewService';
import ProductDiscountService, { toPricing } from './ProductDiscountService';
import FileStorageService, { PUBLIC_UPLOAD_PREFIX } from './FileStorageService';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, isHttpUrl, toInteger } from '../../../shared/server/utils/ValidationUtils';
import { GRADES, ASSEMBLY_STATES, CONDITIONS } from '../../../shared/gunpla';
import mediaManifest from '../../../../docs/model-universe/media-manifest.json';

export interface ProductListQuery {
  grade?: string;
  scale?: string;
  series?: string;
  condition?: string;
  q?: string;
  category?: string;
  categoryId?: number;
  gender?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  channel?: string;
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
  'partnerId',
  'grade', 'scale', 'series', 'modelCode', 'condition', 'assemblyState',
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
  'salesChannel',
];

const categoryInclude = { model: CategoryModel, as: 'category', attributes: ['id', 'name', 'slug'] };
const imagesInclude = { model: ProductImageModel, as: 'images', attributes: ['id', 'url', 'sortOrder'] };

const isImageUrl = (url: string) => url.startsWith(`${PUBLIC_UPLOAD_PREFIX}/`) || url.startsWith('/images/catalog/') || isHttpUrl(url);

const galleryUrls = (product: ProductModel): string[] =>
  ((product.get('images') as ProductImageModel[] | undefined) || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => image.url);

export default class ProductService implements BaseServiceInterface<ProductModel> {
  private reviewService = new ReviewService();
  private discountService = new ProductDiscountService();
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
        [Op.or]: ['name', 'brandName', 'sku', 'series', 'modelCode'].map((column) => ({ [column]: { [Op.iLike]: `%${search}%` } })),
      });
    }
    if (query.gender && GENDERS.includes(query.gender as ProductGender)) conditions.push({ gender: query.gender });
    if (query.brand) conditions.push({ brandName: query.brand });
    for (const field of ['grade', 'scale', 'series', 'condition'] as const) {
      if (query[field]) conditions.push({ [field]: query[field] });
    }
    if (query.categoryId) conditions.push({ categoryId: query.categoryId });
    if (query.minPrice !== undefined) conditions.push({ price: { [Op.gte]: query.minPrice } });
    if (query.maxPrice !== undefined) conditions.push({ price: { [Op.lte]: query.maxPrice } });
    if (query.inStock) conditions.push({ stock: { [Op.gt]: 0 } });
    if (query.featured) conditions.push({ isFeatured: true });
    if (query.channel && SALES_CHANNELS.includes(query.channel as SalesChannel)) {
      conditions.push({ salesChannel: query.channel });
    }
    return { [Op.and]: conditions };
  }

  // Storefront listing: archived or held-back products are never returned. Prices include running discounts.
  async listPublic(query: ProductListQuery) {
    const where = { [Op.and]: [this.buildWhere(query), STOREFRONT_VISIBLE] };
    const include = query.category
      ? [{ ...categoryInclude, where: { slug: query.category }, required: true }]
      : [categoryInclude];
    const { rows, count } = await ProductModel.findAndCountAll({
      attributes: LIST_ATTRIBUTES,
      where,
      include,
      order: PUBLIC_SORTS[query.sort || ''] || PUBLIC_SORTS.newest,
      limit: query.limit,
      offset: query.offset,
      distinct: true,
    });
    return { rows: await this.discountService.withPricing(rows), count };
  }

  // Values for the storefront filter bar.
  async getFilterOptions() {
    const brands = await ProductModel.findAll({
      attributes: [[fn('DISTINCT', col('brandName')), 'brandName']],
      where: STOREFRONT_VISIBLE,
      order: [['brandName', 'ASC']],
      raw: true,
    });
    const prices = (await ProductModel.findOne({
      attributes: [
        [fn('MIN', col('price')), 'min'],
        [fn('MAX', col('price')), 'max'],
      ],
      where: STOREFRONT_VISIBLE,
      raw: true,
    })) as unknown as { min: number | null; max: number | null } | null;
    return {
      brands: brands.map((row) => row.brandName),
      priceRange: { min: Number(prices?.min || 0), max: Number(prices?.max || 0) },
    };
  }

  async getPublicById(id: number) {
    const product = await ProductModel.findOne({
      attributes: { exclude: ['importPrice', 'supplierId', 'isArchived', 'inventoryStatus'] },
      where: { id, ...STOREFRONT_VISIBLE },
      include: [categoryInclude, imagesInclude],
    });
    if (!product) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    const discounts = await this.discountService.getActive([id]);
    return {
      ...product.get({ plain: true }),
      imageAttributions: mediaManifest.filter(entry => [product.imageUrl, ...galleryUrls(product)].includes(entry.path)).map(entry => ({
        imageUrl: entry.path, creator: entry.creator, source: entry.source, license: entry.license, licenseUrl: entry.licenseUrl,
      })),
      ...toPricing(product.price, discounts.get(id)),
      images: galleryUrls(product),
      ratingDistribution: await this.reviewService.getDistribution(id),
    };
  }

  async getReviews(productId: number, limit: number, offset: number) {
    const exists = await ProductModel.count({ where: { id: productId, ...STOREFRONT_VISIBLE } });
    if (!exists) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    return this.reviewService.listByProduct(productId, limit, offset);
  }

  async listAdmin(query: ProductListQuery & { sortKey?: string; sortDirection?: string }) {
    const conditions: WhereOptions[] = [this.buildWhere(query)];
    if (query.status === 'active') conditions.push({ isArchived: false });
    if (query.status === 'archived') conditions.push({ isArchived: true });
    if (query.status === 'featured') conditions.push({ isFeatured: true });
    // Held back by a shop agent inventory adjustment (quarantine, donation, recycling).
    if (query.status === 'held') conditions.push({ inventoryStatus: { [Op.ne]: 'available' } });
    const column = query.sortKey && ADMIN_SORTABLE_COLUMNS.includes(query.sortKey) ? query.sortKey : 'id';
    const { rows, count } = await ProductModel.findAndCountAll({
      attributes: [...LIST_ATTRIBUTES, 'sku', 'sold', 'importPrice', 'isArchived', 'inventoryStatus', 'createdAt'],
      where: { [Op.and]: conditions },
      include: [categoryInclude],
      order: [[column, query.sortDirection === 'desc' ? 'DESC' : 'ASC']],
      limit: query.limit,
      offset: query.offset,
      distinct: true,
    });
    return { rows: await this.discountService.withPricing(rows), count };
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
    const gender = (data.gender || 'unisex') as ProductGender;
    const gunpla: Record<string, unknown> = {};
    for (const field of ['grade', 'scale', 'series', 'modelCode', 'boxCondition', 'descriptionEn', 'descriptionVi'] as const) {
      if (data[field] !== undefined) gunpla[field] = asTrimmedString(data[field]) || null;
    }
    if (gunpla.grade && !GRADES.includes(gunpla.grade as typeof GRADES[number])) errors.push('Invalid Gunpla grade.');
    if (data.condition !== undefined) {
      if (!CONDITIONS.includes(data.condition as typeof CONDITIONS[number])) errors.push('Invalid model condition.');
      gunpla.condition = data.condition;
    }
    if (data.assemblyState !== undefined) {
      if (!ASSEMBLY_STATES.includes(data.assemblyState as typeof ASSEMBLY_STATES[number])) errors.push('Invalid assembly state.');
      gunpla.assemblyState = data.assemblyState;
    }
    for (const field of ['includedAccessories', 'defects'] as const) {
      if (data[field] !== undefined) {
        if (!Array.isArray(data[field]) || (data[field] as unknown[]).length > 30) errors.push(`Invalid ${field}.`);
        else gunpla[field] = (data[field] as unknown[]).map(value => asTrimmedString(value)).filter(Boolean);
      }
    }
    const rawSizes = Array.isArray(data.availableSizes)
      ? data.availableSizes
      : asTrimmedString(data.availableSizes).split(',');
    const availableSizes = Array.from(new Set(rawSizes.map((size) => asTrimmedString(String(size))).filter(Boolean)));
    const images = Array.isArray(data.images) ? data.images.map((url) => asTrimmedString(url)).filter(Boolean) : [];
    const productionDate = asTrimmedString(data.productionDate) ? new Date(asTrimmedString(data.productionDate)) : null;
    // Optional: when omitted, an update keeps the current status (a hold is only lifted on purpose).
    const inventoryStatus = data.inventoryStatus === undefined ? undefined : (data.inventoryStatus as InventoryStatus);

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
    if (data.condition === 'preowned' && (stock > 1 || !imageUrl.startsWith(`${PUBLIC_UPLOAD_PREFIX}/`) || images.length < 2 || images.some(url => !url.startsWith(`${PUBLIC_UPLOAD_PREFIX}/`)))) {
      errors.push('Each preowned collectible requires unique inventory and at least three uploaded actual-item photos.');
    }
    if (productionDate && isNaN(productionDate.getTime())) errors.push('Ngày nhập không hợp lệ.');
    if (inventoryStatus !== undefined && !INVENTORY_STATUSES.includes(inventoryStatus)) {
      errors.push('Trạng thái kho không hợp lệ.');
    }
    if (!categoryId || !(await CategoryModel.findByPk(categoryId))) errors.push('Vui lòng chọn danh mục hợp lệ.');
    if (supplierId && !(await SupplierModel.findByPk(supplierId))) errors.push('Nhà cung cấp không hợp lệ.');
    if (errors.length > 0) throw HttpError.badRequest('Thông tin sản phẩm chưa hợp lệ.', errors);

    const duplicate = await ProductModel.findOne({ where: { sku } });
    if (duplicate && duplicate.id !== currentId) throw HttpError.conflict('SKU đã tồn tại.');

    return {
      values: {
        ...gunpla,
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
        ...(inventoryStatus !== undefined ? { inventoryStatus } : {}),
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
    const { values, images } = await this.validate(data, id);
    try {
      await DatabaseProvider.getInstance().transaction(async (transaction) => {
        const product = await ProductModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!product) throw HttpError.notFound('Model not found.');
        if (values.stock !== product.stock && data.expectedStock !== product.stock) throw HttpError.conflict('Available stock changed. Reload before recording an inventory correction.','STOCK_CHANGED');
        await product.update(values, { transaction });
        await this.replaceImages(id, images, transaction);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw HttpError.conflict('SKU đã tồn tại.');
      throw error;
    }
    // Retain old media: order snapshots and condition evidence may still reference it.
    return this.getAdminById(id);
  }

  // Products that appear in orders or stock imports are archived instead of deleted (history keeps pointing at them).
  async remove(id: number): Promise<{ archived: boolean }> {
    let files: string[] = [];
    const archived = await DatabaseProvider.getInstance().transaction(async transaction => {
      const product = await ProductModel.findByPk(id, { transaction, lock:transaction.LOCK.UPDATE });
      if (!product) throw HttpError.notFound('Model not found.');
      const hasHistory =
        (await OrderItemModel.count({ where:{productId:id},transaction })) > 0 ||
        (await StockImportItemModel.count({ where:{productId:id},transaction })) > 0 ||
        (await ReservationModel.count({ where:{productId:id},transaction })) > 0 ||
        (await LoyaltyGiftModel.count({where:{productId:id},transaction})) > 0 ||
        (await LoyaltyRedemptionModel.count({where:{giftProductId:id},transaction})) > 0 ||
        (await ReturnEventModel.count({where:{productId:id},transaction})) > 0 ||
        (await BuybackRequestModel.count({where:{productId:id},transaction})) > 0 ||
        (await PawnContractModel.count({where:{productId:id},transaction})) > 0;
      if (hasHistory) { await product.update({isArchived:true,isFeatured:false},{transaction}); return true; }
      const gallery = await ProductImageModel.findAll({where:{productId:id},transaction});
      files = [product.imageUrl,...gallery.map(image => image.url)];
      await product.destroy({transaction});
      return false;
    });
    if (!archived) await this.fileStorageService.removeFiles(files);
    return {archived};
  }
}
