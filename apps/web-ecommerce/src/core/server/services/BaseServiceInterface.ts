import { Model, Optional } from 'sequelize';

export interface BaseServiceInterface<T> {
  findByPk(id: string | number): Promise<any | null>;
  findAll(filter?: object): Promise<any[]>;
  insert(data: Optional<any, any>, options?: object): Promise<Model<any, any> | null>;
  bulkInsert(data: Optional<any, any>[], options?: object): Promise<any[] | null>;
}
