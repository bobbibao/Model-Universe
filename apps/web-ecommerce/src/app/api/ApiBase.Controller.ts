import { join } from 'path';
import { existsSync } from 'fs';
import { Request, Response } from 'express';
import ApiResponse from '../../shared/server/utils/ApiResponseUtils';
import DatabaseProvider from '../../core/server/database/Database.Provider';
import { ServiceTypeMap, CommonServiceMethods } from '../../shared/types/ServiceTypeMap';
import Logger from '../../shared/server/utils/logger';
import HttpError from '../../shared/server/utils/HttpError';
const SERVICES_PATH = '../../core/server/services/';

export default class ApiBaseController {
  protected DBProvider = DatabaseProvider.getInstance();

  protected async getService<T extends keyof ServiceTypeMap>(): Promise<
    (ServiceTypeMap[T] & CommonServiceMethods) | undefined
  > {
    try {
      const modelName = Reflect.getMetadata('modelName', this.constructor);
      const serviceName = this._getServiceName(modelName);
      const servicePath = join(__dirname, `${SERVICES_PATH}${serviceName}`);

      if (process.env.NODE_ENV !== 'production') {
        Logger.INFO(`[Importing] ${servicePath}`);
      }

      if (!existsSync(`${servicePath}.js`) && !existsSync(`${servicePath}.ts`)) {
        Logger.WARN(`Service file not found for model: ${modelName}`);
        return undefined;
      }

      // Existing services are compiled CommonJS modules. Native ESM import would reject
      // extensionless service paths in production and drive-letter paths on Windows.
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- Resolve the existing CommonJS service by model name.
      const ServiceClassModule = require(servicePath);
      const ServiceClass = ServiceClassModule.default;

      if (!ServiceClass) {
        Logger.WARN(`Service class not found for model: ${modelName}`);
        return undefined;
      }

      const serviceInstance = new ServiceClass();
      return serviceInstance as ServiceTypeMap[T] & CommonServiceMethods;
    } catch (error) {
      Logger.ERROR('Error initializing service:', error);
      return undefined;
    }
  }

  private _getServiceName(modelName: string) {
    return modelName.replace('Model', 'Service');
  }

  // Resolves the controller's service and fails loudly when it cannot be loaded.
  protected async requireService<S>(): Promise<S> {
    const service = await this.getService();
    if (!service) {
      throw new Error('Service not initialized');
    }
    return service as unknown as S;
  }

  protected sendSuccess<T>(res: Response, data?: T, message?: string, statusCode = 200) {
    return new ApiResponse({
      statusCode,
      toastType: message ? 'success' : undefined,
      userMessages: message ? [message] : [],
      data,
    }).send(res);
  }

  // Expected HttpErrors become their status and user message; anything else is logged and reported as 500.
  protected handleError(res: Response, error: unknown, context: string) {
    if (error instanceof HttpError) {
      return new ApiResponse({
        statusCode: error.statusCode,
        toastType: 'error',
        userMessages: [error.message],
        userValidationMessages: error.validationMessages,
        errorCode: error.code,
        errorParams: error.params,
      }).send(res);
    }
    Logger.ERROR(`Error in ${context}: `, error);
    return new ApiResponse({
      statusCode: 500,
      toastType: 'error',
      userMessages: ['Something went wrong. Please try again.'],
      errorCode: 'SERVER_ERROR',
    }).send(res);
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const service = await this.getService();
      if (!service) {
        throw new Error('Service not initialized');
      }

      const { id } = req.params;
      if (service.findByPk) {
        const result = await service.findByPk(id);
        res.json(result);
      } else {
        throw new Error('Method findByPk not implemented');
      }
    } catch (error) {
      Logger.ERROR('Error in getById:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async get(_: Request, res: Response): Promise<void> {
    try {
      const service = await this.getService();
      if (!service) {
        throw new Error('Service not initialized');
      }

      if (service.findAll) {
        const result = await service.findAll();
        res.json(result);
      } else {
        throw new Error('Method findAll not implemented');
      }
    } catch (error) {
      Logger.ERROR('Error in get all:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const service = await this.getService();
      if (!service) {
        throw new Error('Service not initialized');
      }

      const { id } = req.params;
      if (service.deleteById) {
        const result = await service.deleteById(+id);
        res.json(result);
      } else {
        throw new Error('Method deleteById not implemented');
      }
    } catch (error) {
      Logger.ERROR('Error in delete:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async put(_: Request, res: Response): Promise<void> {
    try {
      res.json({ message: 'Add put here' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async post(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body;
      const service = await this.getService();
      if (!service) {
        throw new Error('Service not initialized');
      }
      let result = [];
      if (service.insert && !Array.isArray(data)) {
        const insertResult = await service.insert(data);
        result = insertResult ? [insertResult] : [];
      } else if (service.bulkInsert && Array.isArray(data)) {
        const bulkInsertResult = await service.bulkInsert(data);
        result = bulkInsertResult || [];
      } else {
        throw new Error('Method insert or bulkInsert not implemented');
      }
      const response = new ApiResponse({
        statusCode: 200,
        toastType: 'success',
        systemMessage: 'Saved',
        userMessages: ['Created successfully'],
        data: result,
      });
      response.send(res);
    } catch (error) {
      Logger.ERROR('Error in insert service:', error);
      const response = new ApiResponse({
        statusCode: 500,
        toastType: 'error',
        systemMessage: 'Error',
        userMessages: ['Failed to create due to some reason'],
      });
      response.send(res);
    }
  }
}
