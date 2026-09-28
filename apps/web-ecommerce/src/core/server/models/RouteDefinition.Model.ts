// RouteDefinition.Model.ts
export interface RouteDefinition {
  path: string;
  method: 'get' | 'post' | 'put' | 'delete';
  methodName: string;
  handler?: (req?: Request, res?: Response) => any;
}
