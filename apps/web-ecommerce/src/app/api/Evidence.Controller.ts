import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import EvidenceService from '../../core/server/services/EvidenceService';
import HttpError from '../../shared/server/utils/HttpError';

@Controller('/evidence')
export default class EvidenceController extends ApiBaseController {
  private evidence = new EvidenceService();
  @Post('/')
  async upload(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return this.sendSuccess(res, await this.evidence.upload(req, res, req.user.id), undefined, 201);
    } catch (error) { return this.handleError(res, error, 'Private evidence upload'); }
  }
  @Get('/:id')
  async read(req: Request, res: Response) {
    try {
      if (!req.user) throw HttpError.unauthorized();
      return await this.evidence.read(Number(req.params.id), req.user, res);
    } catch (error) { if (!res.headersSent) return this.handleError(res, error, 'Private evidence read'); }
  }
}
