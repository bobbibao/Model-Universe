import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get, Post } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type MarketingCampaignService from '../../core/server/services/MarketingCampaignService';

// The agent's campaigns (/admin/agent/campaigns) and the admins' protective controls: end a campaign, pause an ad,
// pause every agent ad.
@Controller('/admin/agent/campaigns')
@ControllerModel('MarketingCampaignModel')
export default class AdminAgentCampaignController extends ApiBaseController {
  @Get('/')
  async getCampaigns(_req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketingCampaignService>();
      return this.sendSuccess(res, await service.list());
    } catch (error) {
      return this.handleError(res, error, "AdminAgentCampaignController's getCampaigns");
    }
  }

  @Post('/ads/pause-all')
  async pauseAllAds(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketingCampaignService>();
      return this.sendSuccess(res, null, await service.pauseAllAds(req.user?.id as number));
    } catch (error) {
      return this.handleError(res, error, "AdminAgentCampaignController's pauseAllAds");
    }
  }

  @Post('/ads/:ref/pause')
  async pauseAd(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketingCampaignService>();
      return this.sendSuccess(res, null, await service.pauseAd(req.params.ref, req.user?.id as number));
    } catch (error) {
      return this.handleError(res, error, "AdminAgentCampaignController's pauseAd");
    }
  }

  @Post('/:ref/end')
  async endCampaign(req: Request, res: Response) {
    try {
      const service = await this.requireService<MarketingCampaignService>();
      return this.sendSuccess(res, null, await service.endCampaign(req.params.ref, req.user?.id as number));
    } catch (error) {
      return this.handleError(res, error, "AdminAgentCampaignController's endCampaign");
    }
  }
}
