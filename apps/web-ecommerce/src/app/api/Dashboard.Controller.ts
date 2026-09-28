import { ControllerModel } from '../../shared/server/decorators/controllerModel.decorator';
import { Controller } from '../../shared/server/decorators/controller.decorator';
import { Get } from '../../shared/server/decorators/router.decorator';
import ApiBaseController from './ApiBase.Controller';
import type { Request, Response } from 'express';
import type DashboardService from '../../core/server/services/DashboardService';
import { toInteger } from '../../shared/server/utils/ValidationUtils';

// Admin statistics (protected by the /admin route rule).
@Controller('/admin/dashboard')
@ControllerModel('DashboardModel')
export default class DashboardController extends ApiBaseController {
  @Get('/summary')
  async getSummary(_: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getSummary());
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getSummary");
    }
  }

  @Get('/monthly')
  async getMonthlySeries(req: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getMonthlySeries(toInteger(req.query.months)));
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getMonthlySeries");
    }
  }

  @Get('/inventory-by-category')
  async getInventoryByCategory(_: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getInventoryByCategory());
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getInventoryByCategory");
    }
  }

  @Get('/gender-ratio')
  async getGenderRatio(_: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getGenderRatio());
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getGenderRatio");
    }
  }

  @Get('/recent-orders')
  async getRecentOrders(req: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getRecentOrders(toInteger(req.query.limit)));
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getRecentOrders");
    }
  }

  @Get('/top-products')
  async getTopProducts(req: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getTopProducts(toInteger(req.query.limit)));
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getTopProducts");
    }
  }

  @Get('/top-customers')
  async getTopCustomers(req: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getTopCustomers(toInteger(req.query.limit)));
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getTopCustomers");
    }
  }

  @Get('/distributions')
  async getDistributions(_: Request, res: Response) {
    try {
      const service = await this.requireService<DashboardService>();
      return res.json(await service.getDistributions());
    } catch (error) {
      return this.handleError(res, error, "DashboardController's getDistributions");
    }
  }
}
