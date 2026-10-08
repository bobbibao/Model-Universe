import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import type { Transaction } from 'sequelize';
import ProductModel from '../database/client/models/Product.Model';
import ProductImageModel from '../database/client/models/ProductImage.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import StockImportItemModel from '../database/client/models/StockImportItem.Model';
import BuybackRequestModel from '../database/client/models/BuybackRequest.Model';
import PawnContractModel from '../database/client/models/PawnContract.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import FileStorageService from './FileStorageService';

// Used only after the source workflow has verified buyback ownership or contractual pawn disposal.
export async function activateOwnedCollectibleDraft(productId: number, modelCode: string, acquisitionCostVnd: number, transaction: Transaction) {
  const product = await ProductModel.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!product || !product.isArchived || product.stock !== 0 || product.sold !== 0 || product.condition !== 'preowned' || product.modelCode !== modelCode) throw HttpError.conflict('Use a fresh archived, zero-stock preowned draft with the inspected model code.');
  // A transaction uses one PostgreSQL connection; do not issue overlapping queries on it.
  const history = [
    await StockImportItemModel.count({ where: { productId }, transaction }),
    await OrderItemModel.count({ where: { productId }, transaction }),
    await BuybackRequestModel.count({ where: { productId }, transaction }),
    await PawnContractModel.count({ where: { productId }, transaction }),
  ];
  if (history.some(count => count > 0)) throw HttpError.conflict('This SKU already belongs to a historical inventory source.');
  const photos = [product.imageUrl, ...(await ProductImageModel.findAll({ where: { productId }, transaction })).map(file => file.url)];
  if (new Set(photos).size < 3 || photos.some(url => !/^\/uploads\/products\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(url))) throw HttpError.badRequest('Use at least three distinct uploaded actual-item photographs.');
  const hashes = new Set<string>();
  try { for (const url of photos) hashes.add(crypto.createHash('sha256').update(await fs.readFile(path.join(FileStorageService.getUploadRoot(), url.slice('/uploads/'.length)))).digest('hex')); }
  catch { throw HttpError.badRequest('An actual-item upload is missing. Reconcile the listing photographs before intake.'); }
  if (hashes.size < 3) throw HttpError.badRequest('Use three distinct actual-item views, not copies of the same photograph.');
  await product.update({ stock: 1, importPrice: acquisitionCostVnd, isArchived: false, inventoryStatus: 'available' }, { transaction });
  return product;
}
