import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import ShippingService from '../../core/server/services/ShippingService';
import * as SuperAi from '../../core/server/services/delivery/SuperAiClient';
import { shopPublicUrl } from '../../core/server/services/marketing/platforms';
import HttpError from '../../shared/server/utils/HttpError';

// The shop's SuperAI pickup warehouse, delivery defaults and the SuperAI status webhook.
@Controller('/admin/shipping')
export default class AdminShippingController extends ApiBaseController {
  private service = new ShippingService();

  @Get('/origin')
  async origin(_req: Request, res: Response) {
    try {
      const configured = SuperAi.superAiConfigured();
      const [warehouses, webhook] = configured
        ? await Promise.all([SuperAi.warehouses().catch(() => []), SuperAi.webhookInfo().catch(() => null)])
        : [[], null];
      return res.json({
        origin: await this.service.origin(),
        config: this.service.config(),
        warehouses,
        webhook: { registered: webhook?.url ?? null, expected: this.webhookUrl(true) },
      });
    } catch (error) {
      return this.handleError(res, error, 'Shipping origin');
    }
  }

  @Put('/origin')
  async save(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.service.saveOrigin(req.user!.id, req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'Save shipping origin');
    }
  }

  // Points SuperAI's status callbacks at this shop (WEBHOOK_PUBLIC_URL or SHOP_PUBLIC_URL, with the secret
  // SUPERAI_WEBHOOK_TOKEN).
  // Applies to orders created afterwards.
  @Post('/superai/webhook')
  async registerWebhook(req: Request, res: Response) {
    try {
      if (req.user?.role !== 'ADMIN') throw HttpError.forbidden();
      const url = this.webhookUrl(false);
      if (!url)
        throw HttpError.conflict(
          'Set SUPERAI_WEBHOOK_TOKEN and a public SHOP_PUBLIC_URL first.',
          'WEBHOOK_UNAVAILABLE',
        );
      return this.sendSuccess(res, await SuperAi.registerWebhook(url));
    } catch (error) {
      return this.handleError(res, error, 'Register SuperAI webhook');
    }
  }

  // The callback URL; `masked` hides the token for display.
  private webhookUrl(masked: boolean) {
    const token = process.env.SUPERAI_WEBHOOK_TOKEN?.trim();
    // WEBHOOK_PUBLIC_URL: a public tunnel in development, where SHOP_PUBLIC_URL is localhost.
    const base = (process.env.WEBHOOK_PUBLIC_URL?.trim() || shopPublicUrl()).replace(/\/+$/, '');
    if (!token || !/^https:\/\//.test(base)) return null;
    return `${base}/api/shipping/superai/webhook?token=${masked ? '••••••' : encodeURIComponent(token)}`;
  }
}
