import WishlistItemModel from '../database/client/models/WishlistItem.Model';
import ProductModel from '../database/client/models/Product.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString, toInteger } from '../../../shared/server/utils/ValidationUtils';

const productInclude = {
  model: ProductModel,
  as: 'product',
  attributes: ['id', 'name', 'brandName', 'price', 'imageUrl', 'stock', 'isArchived', 'availableSizes'],
};

export default class WishlistService {
  // Items whose product was archived stay in the list but are flagged as unavailable.
  async list(userId: number) {
    const items = await WishlistItemModel.findAll({
      where: { userId },
      include: [productInclude],
      order: [['createdAt', 'DESC']],
    });
    return items.map((item) => {
      const product = item.get('product') as ProductModel;
      return {
        id: item.id,
        productId: item.productId,
        size: item.size,
        createdAt: item.createdAt,
        available: !product.isArchived,
        product: {
          id: product.id,
          name: product.name,
          brandName: product.brandName,
          price: product.price,
          imageUrl: product.imageUrl,
          stock: product.stock,
        },
      };
    });
  }

  // Adding an item that is already in the list is a no-op.
  async add(userId: number, data: Record<string, unknown>) {
    const productId = toInteger(data.productId);
    const size = asTrimmedString(data.size);
    const product = productId ? await ProductModel.findByPk(productId) : null;
    if (!product || product.isArchived) throw HttpError.notFound('Không tìm thấy sản phẩm.');
    const sizes = product.availableSizes || [];
    if ((sizes.length > 0 && !sizes.includes(size)) || (sizes.length === 0 && size)) {
      throw HttpError.badRequest('Kích thước không hợp lệ.');
    }
    const [item] = await WishlistItemModel.findOrCreate({ where: { userId, productId: product.id, size } });
    return { id: item.id, productId: item.productId, size: item.size };
  }

  async remove(userId: number, itemId: number): Promise<void> {
    const removed = await WishlistItemModel.destroy({ where: { id: itemId, userId } });
    if (!removed) throw HttpError.notFound('Không tìm thấy sản phẩm trong danh sách yêu thích.');
  }
}
