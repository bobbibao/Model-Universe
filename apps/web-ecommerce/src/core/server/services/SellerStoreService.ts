import PartnerProfileModel from '../database/client/models/PartnerProfile.Model';
import UserModel from '../database/internal/models/User.Model';
import ProductService from './ProductService';
import HttpError from '../../../shared/server/utils/HttpError';

export default class SellerStoreService {
  async get(id: number, offset = 0) {
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound();
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw HttpError.badRequest('Invalid seller page offset.');
    const seller = await PartnerProfileModel.findOne({ where: { id, status: 'verified' } });
    const owner = seller && await UserModel.findOne({ where: { id: seller.userId, isActive: true }, attributes: ['id'] });
    if (!owner || !seller?.identityVerifiedAt || !seller.bankVerifiedAt || seller.pendingBankChange) throw HttpError.notFound();
    const products = await new ProductService().listPublic({ partnerId: id, limit: 12, offset, sort: 'newest' });
    // Publish only the seller's display name and factual verification. Never expose application/bank/evidence data.
    return { id: seller.id, displayName: seller.application.displayName, identityVerified: true, bankVerified: true, products };
  }
}
