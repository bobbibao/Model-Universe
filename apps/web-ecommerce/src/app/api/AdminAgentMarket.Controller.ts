import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Delete, Get, Post, Put } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type MarketService from '../../core/server/services/MarketService';
import { CSV_TEMPLATE } from '../../core/server/services/MarketService';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

// Market data for the growth agent (/admin/agent/market): competitors, their prices (by hand or the CSV template)
// and campaigns, the retail calendar, and the health of the agent's collectors.
@Controller('/admin/agent/market')
@ControllerModel('MarketModel')
export default class AdminAgentMarketController extends ApiBaseController {
  @Get('/competitors')
  async getCompetitors(_req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await (await this.requireService<MarketService>()).listCompetitors());
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's getCompetitors");
    }
  }

  @Post('/competitors')
  async createCompetitor(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketService>();
      return this.sendSuccess(res, await service.createCompetitor(req.body || {}), 'Đã thêm đối thủ.', 201);
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's createCompetitor");
    }
  }

  @Put('/competitors/:id')
  async updateCompetitor(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketService>();
      const competitor = await service.updateCompetitor(toInteger(req.params.id) || 0, req.body || {});
      return this.sendSuccess(res, competitor, 'Đã cập nhật đối thủ.');
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's updateCompetitor");
    }
  }

  @Delete('/competitors/:id')
  async removeCompetitor(req: Request, res: Response) {
    try {
      await (await this.requireService<MarketService>()).removeCompetitor(toInteger(req.params.id) || 0);
      return this.sendSuccess(res, undefined, 'Đã xoá đối thủ.');
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's removeCompetitor");
    }
  }

  @Get('/prices')
  async getPrices(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketService>();
      return this.sendSuccess(res, await service.listPrices(toInteger(req.query.competitorId)));
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's getPrices");
    }
  }

  @Post('/prices')
  async addPrice(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketService>();
      return this.sendSuccess(res, await service.addPrice(req.body || {}), 'Đã thêm giá đối thủ.', 201);
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's addPrice");
    }
  }

  @Get('/prices/template')
  async getPriceTemplate(_req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="gia-doi-thu-mau.csv"');
    return res.send(`\uFEFF${CSV_TEMPLATE}`);
  }

  @Post('/prices/import')
  async importPrices(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketService>();
      const result = await service.importPrices(req.body?.csv);
      return this.sendSuccess(res, result, `Đã nhập ${result.imported} giá đối thủ.`, 201);
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's importPrices");
    }
  }

  @Delete('/prices/:id')
  async removePrice(req: Request, res: Response) {
    try {
      await (await this.requireService<MarketService>()).removePrice(toInteger(req.params.id) || 0);
      return this.sendSuccess(res, undefined, 'Đã xoá giá.');
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's removePrice");
    }
  }

  @Get('/campaigns')
  async getCampaigns(_req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await (await this.requireService<MarketService>()).listCampaigns());
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's getCampaigns");
    }
  }

  @Post('/campaigns')
  async addCampaign(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketService>();
      return this.sendSuccess(res, await service.addCampaign(req.body || {}), 'Đã thêm chương trình.', 201);
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's addCampaign");
    }
  }

  @Delete('/campaigns/:id')
  async removeCampaign(req: Request, res: Response) {
    try {
      await (await this.requireService<MarketService>()).removeCampaign(toInteger(req.params.id) || 0);
      return this.sendSuccess(res, undefined, 'Đã xoá chương trình.');
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's removeCampaign");
    }
  }

  @Get('/events')
  async getEvents(_req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await (await this.requireService<MarketService>()).listEvents());
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's getEvents");
    }
  }

  @Get('/sources')
  async getSources(_req: Request, res: Response) {
    try {
      return this.sendSuccess(res, await (await this.requireService<MarketService>()).listSources());
    } catch (error) {
      return this.handleError(res, error, "AdminAgentMarketController's getSources");
    }
  }
}
