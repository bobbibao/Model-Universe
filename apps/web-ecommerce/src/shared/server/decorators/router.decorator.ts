import { RouteDefinition } from '../../../core/server/models/RouteDefinition.Model';

export function Get(path: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor): void => {
    if (!Reflect.hasMetadata('routes', target.constructor)) {
      Reflect.defineMetadata('routes', [], target.constructor);
    }
    const routes = Reflect.getMetadata('routes', target.constructor) as Array<RouteDefinition>;
    routes.push({
      method: 'get',
      path,
      methodName: propertyKey,
      handler: descriptor.value,
    });
    Reflect.defineMetadata('routes', routes, target.constructor);
  };
}

export function Post(path: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor): void => {
    if (!Reflect.hasMetadata('routes', target.constructor)) {
      Reflect.defineMetadata('routes', [], target.constructor);
    }
    const routes = Reflect.getMetadata('routes', target.constructor) as Array<RouteDefinition>;
    routes.push({
      method: 'post',
      path,
      methodName: propertyKey,
      handler: descriptor.value,
    });
    Reflect.defineMetadata('routes', routes, target.constructor);
  };
}

export function Delete(path: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor): void => {
    if (!Reflect.hasMetadata('routes', target.constructor)) {
      Reflect.defineMetadata('routes', [], target.constructor);
    }
    const routes = Reflect.getMetadata('routes', target.constructor) as Array<RouteDefinition>;
    routes.push({
      method: 'delete',
      path,
      methodName: propertyKey,
      handler: descriptor.value,
    });
    Reflect.defineMetadata('routes', routes, target.constructor);
  };
}

export function Put(path: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor): void => {
    if (!Reflect.hasMetadata('routes', target.constructor)) {
      Reflect.defineMetadata('routes', [], target.constructor);
    }
    const routes = Reflect.getMetadata('routes', target.constructor) as Array<RouteDefinition>;
    routes.push({
      method: 'put',
      path,
      methodName: propertyKey,
      handler: descriptor.value,
    });
    Reflect.defineMetadata('routes', routes, target.constructor);
  };
}

export function Param(paramName: string) {
  return (target: any, propertyKey: string, parameterIndex: number): void => {
    const existingParameters: Array<any> = Reflect.getMetadata('params', target, propertyKey) || [];
    existingParameters.push({ paramName, parameterIndex });
    Reflect.defineMetadata('params', existingParameters, target, propertyKey);
  };
}
