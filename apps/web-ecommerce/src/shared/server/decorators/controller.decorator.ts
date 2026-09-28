import { Router, Request, Response, NextFunction } from 'express';
import Logger from '../utils/logger';
import { RouteDefinition } from '../../../core/server/models/RouteDefinition.Model';

export const router = Router();

interface ParamMetadata {
  paramName: string;
  parameterIndex: number;
}

export const Controller = (prefix?: string): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata('prefix', prefix, target);
    if (!Reflect.hasMetadata('routes', target)) {
      Reflect.defineMetadata('routes', [], target);
    }
    const routes: Array<RouteDefinition> = Reflect.getMetadata('routes', target);
    const instance: any = new target();
    routes.forEach((route: RouteDefinition) => {
      router[route.method](`${prefix}${route.path}`, (req: Request, res: Response, next: NextFunction) => {
        const params: ParamMetadata[] = Reflect.getMetadata('params', target.prototype, route.methodName) || [];
        const args = params
          .sort((a: ParamMetadata, b: ParamMetadata) => a.parameterIndex - b.parameterIndex)
          .map((param: ParamMetadata) => req.params[param.paramName]);
        instance[route.methodName](req, res, next, ...args).catch(next);
      });
      Logger.DEBUG('Loading route: ', {
        path: `${prefix}${route.path}`,
        method: route.methodName,
        controller: target.name,
      });
    });
  };
};
