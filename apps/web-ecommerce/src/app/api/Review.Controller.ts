import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ReviewService from '../../core/server/services/ReviewService';
import HttpError from '../../shared/server/utils/HttpError';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/reviews')
@ControllerModel('ReviewModel')
export default class ReviewController extends ApiBaseController {
  @Get('/eligibility/:productId')
  async getEligibility(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<ReviewService>();
      return res.json(await service.getEligibility(req.user.id, toInteger(req.params.productId) || 0));
    } catch (error) {
      return this.handleError(res, error, "ReviewController's getEligibility");
    }
  }

  @Post('/')
  async createReview(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      const service = await this.requireService<ReviewService>();
      const review = await service.create(req.user.id, req.body || {});
      return this.sendSuccess(res, review, 'Cảm ơn bạn đã đánh giá sản phẩm.', 201);
    } catch (error) {
      return this.handleError(res, error, "ReviewController's createReview");
    }
  }
}
