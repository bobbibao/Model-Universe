import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Delete, Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ProductService from '../../core/server/services/ProductService';
import { apiProductMessage } from '../../shared/server/utils/ApiLocale';
import HttpError from '../../shared/server/utils/HttpError';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

const parseId = (value: string): number => {
  const id = toInteger(value);
  if (!id || id <= 0) throw HttpError.notFound('Không tìm thấy sản phẩm.');
  return id;
};

@Controller('/admin/products')
@ControllerModel('ProductModel')
export default class AdminProductController extends ApiBaseController {
  @Get('/')
  async getProducts(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.listAdmin({
        q: req.query.q as string | undefined,
        categoryId: toInteger(req.query.categoryId),
        status: req.query.status as string | undefined,
        sortKey: req.query.sort as string | undefined,
        sortDirection: req.query.direction as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminProductController's getProducts");
    }
  }

  @Get('/:id')
  async getProduct(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      return res.json(await service.getAdminById(parseId(req.params.id)));
    } catch (error) {
      return this.handleError(res, error, "AdminProductController's getProduct");
    }
  }

  @Post('/')
  async createProduct(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      const product = await service.create(req.body || {});
      return this.sendSuccess(res, product, apiProductMessage(req, 'created'), 201);
    } catch (error) {
      return this.handleError(res, error, "AdminProductController's createProduct");
    }
  }

  @Put('/:id')
  async updateProduct(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      const product = await service.update(parseId(req.params.id), req.body || {});
      return this.sendSuccess(res, product, apiProductMessage(req, 'updated'));
    } catch (error) {
      return this.handleError(res, error, "AdminProductController's updateProduct");
    }
  }

  @Delete('/:id')
  async deleteProduct(req: Request, res: Response) {
    try {
      const service = await this.requireService<ProductService>();
      const { archived } = await service.remove(parseId(req.params.id));
      return this.sendSuccess(
        res,
        { archived },
        apiProductMessage(req, archived ? 'archivedHistory' : 'deleted'),
      );
    } catch (error) {
      return this.handleError(res, error, "AdminProductController's deleteProduct");
    }
  }
}
