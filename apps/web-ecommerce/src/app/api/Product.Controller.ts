import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ProductService from '../../core/server/services/ProductService';
import HttpError from '../../shared/server/utils/HttpError';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_REVIEW_PAGE_SIZE = 3;

const parseId = (value: string): number => {
  const id = toInteger(value);
  if (!id || id <= 0) throw HttpError.notFound('Không tìm thấy sản phẩm.');
  return id;
};

@Controller('/products')
@ControllerModel('ProductModel')
export default class ProductController extends ApiBaseController {
  @Get('/')
  async getProducts(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      const { page, perPage, limit, offset } = parsePagination(req, DEFAULT_PAGE_SIZE);
      const { rows, count } = await service.listPublic({
        q: req.query.q as string | undefined,
        category: req.query.category as string | undefined,
        gender: req.query.gender as string | undefined,
        brand: req.query.brand as string | undefined,
        minPrice: toInteger(req.query.minPrice),
        maxPrice: toInteger(req.query.maxPrice),
        inStock: req.query.inStock === 'true',
        featured: req.query.featured === 'true',
        sort: req.query.sort as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "ProductController's getProducts");
    }
  }

  // Declared before '/:id' so that it is matched first.
  @Get('/filters')
  async getFilterOptions(_: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      return res.json(await service.getFilterOptions());
    } catch (error) {
      return this.handleError(res, error, "ProductController's getFilterOptions");
    }
  }

  @Get('/:id')
  async getProduct(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      return res.json(await service.getPublicById(parseId(req.params.id)));
    } catch (error) {
      return this.handleError(res, error, "ProductController's getProduct");
    }
  }

  @Get('/:id/reviews')
  async getReviews(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      const { page, perPage, limit, offset } = parsePagination(req, DEFAULT_REVIEW_PAGE_SIZE);
      const { rows, count } = await service.getReviews(parseId(req.params.id), limit, offset);
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "ProductController's getReviews");
    }
  }
}
