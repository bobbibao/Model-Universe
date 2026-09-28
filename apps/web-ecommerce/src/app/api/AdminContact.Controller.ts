import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ContactMessageService from '../../core/server/services/ContactMessageService';
import { parsePagination, toPaginatedPayload } from '../../shared/server/utils/PaginationUtils';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

@Controller('/admin/contacts')
@ControllerModel('ContactMessageModel')
export default class AdminContactController extends ApiBaseController {
  @Get('/')
  async getMessages(req: Request, res: Response) {
    try {
      const service = await this.requireService<ContactMessageService>();
      const { page, perPage, limit, offset } = parsePagination(req);
      const { rows, count } = await service.list({
        q: req.query.q as string | undefined,
        status: req.query.status as string | undefined,
        limit,
        offset,
      });
      return res.json(toPaginatedPayload(rows, count, page, perPage));
    } catch (error) {
      return this.handleError(res, error, "AdminContactController's getMessages");
    }
  }

  @Put('/:id/status')
  async updateStatus(req: Request, res: Response) {
    try {
      const service = await this.requireService<ContactMessageService>();
      const message = await service.updateStatus(toInteger(req.params.id) || 0, req.body?.status);
      return this.sendSuccess(res, message, 'Đã cập nhật trạng thái.');
    } catch (error) {
      return this.handleError(res, error, "AdminContactController's updateStatus");
    }
  }
}
