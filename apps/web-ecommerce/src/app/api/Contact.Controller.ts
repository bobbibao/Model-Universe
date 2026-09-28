import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type ContactMessageService from '../../core/server/services/ContactMessageService';

@Controller('/contact')
@ControllerModel('ContactMessageModel')
export default class ContactController extends ApiBaseController {
  // Public: storefront contact form.
  @Post('/')
  async sendMessage(req: Request, res: Response) {
    try {
      const service = await this.requireService<ContactMessageService>();
      await service.create(req.body || {});
      return this.sendSuccess(res, undefined, 'Cảm ơn bạn đã liên hệ, chúng tôi sẽ phản hồi sớm nhất.', 201);
    } catch (error) {
      return this.handleError(res, error, "ContactController's sendMessage");
    }
  }
}
