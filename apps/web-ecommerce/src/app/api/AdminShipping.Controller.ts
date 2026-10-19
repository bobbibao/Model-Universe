import type { Request, Response } from 'express';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import ShippingService from '../../core/server/services/ShippingService';
import * as SuperAi from '../../core/server/services/delivery/SuperAiClient';
import { shopPublicUrl } from '../../core/server/services/marketing/platforms';
import HttpError from '../../shared/server/utils/HttpError';
import ShipmentPrintService from '../../core/server/services/ShipmentPrintService';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

// The shop's SuperAI pickup warehouse, delivery defaults and the SuperAI status webhook.
@Controller('/admin/shipping')
export default class AdminShippingController extends ApiBaseController {
  private service = new ShippingService();
  private printing = new ShipmentPrintService();

  // End-of-day printing: the labels to print (and paid orders still without a waybill).
  @Get('/print-queue')
  async printQueue(req: Request, res: Response) {
    try {
      return res.json(
        await this.printing.queue(req.user!.id, {
          day: typeof req.query.day === 'string' && req.query.day ? req.query.day : undefined,
          status: String(req.query.status || ''),
        }),
      );
    } catch (error) {
      return this.handleError(res, error, 'Print queue');
    }
  }

  @Get('/print-batches')
  async printBatches(req: Request, res: Response) {
    try {
      return res.json(await this.printing.batches(req.user!.id));
    } catch (error) {
      return this.handleError(res, error, 'Print batches');
    }
  }

  @Post('/print-batches')
  async createPrintBatch(req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await this.printing.createBatch(req.user!.id, req.body || {}));
    } catch (error) {
      return this.handleError(res, error, 'Create print batch');
    }
  }

  // The batch's labels as one PDF (inline to print from the browser, or ?download=1 to save the file).
  @Get('/print-batches/:id/labels.pdf')
  async printBatchPdf(req: Request, res: Response) {
    try {
      const id = toInteger(req.params.id) || 0;
      const pdf = await this.printing.pdf(req.user!.id, id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${req.query.download ? 'attachment' : 'inline'}; filename="nhan-giao-hang-dot-${id}.pdf"`,
      );
      res.setHeader('Cache-Control', 'no-store');
      return res.send(pdf);
    } catch (error) {
      return this.handleError(res, error, 'Print batch PDF');
    }
  }

  @Get('/print-batches/:id/orders.csv')
  async printBatchCsv(req: Request, res: Response) {
    try {
      const id = toInteger(req.params.id) || 0;
      const csv = await this.printing.csv(req.user!.id, id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="don-giao-hang-dot-${id}.csv"`);
      return res.send(csv);
    } catch (error) {
      return this.handleError(res, error, 'Print batch CSV');
    }
  }

  // The carriers' official labels (live SuperAI waybills only).
  @Get('/print-batches/:id/carrier-labels')
  async carrierLabels(req: Request, res: Response) {
    try {
      return res.json(await this.printing.carrierLabels(req.user!.id, toInteger(req.params.id) || 0));
    } catch (error) {
      return this.handleError(res, error, 'Carrier labels');
    }
  }

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
