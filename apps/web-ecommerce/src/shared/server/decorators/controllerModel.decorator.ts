// model.decorator.ts
import "reflect-metadata";

export function ControllerModel(modelName: string): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata("modelName", modelName, target);
  };
}
