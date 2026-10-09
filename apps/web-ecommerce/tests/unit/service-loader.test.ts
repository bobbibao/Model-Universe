import 'reflect-metadata';
import ApiBaseController from '../../src/app/api/ApiBase.Controller';
import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import CategoryService from '../../src/core/server/services/CategoryService';

class CategoryVerificationController extends ApiBaseController {
  resolve() { return this.requireService<CategoryService>(); }
}
Reflect.defineMetadata('modelName', 'CategoryModel', CategoryVerificationController);

describe('existing controller service resolution', () => {
  afterAll(async () => { await DatabaseProvider.getInstance().close(); });

  it('loads the actual CommonJS service without opening a database connection', async () => {
    const authenticate = jest.spyOn(DatabaseProvider.getInstance(), 'authenticate');
    try {
      await expect(new CategoryVerificationController().resolve()).resolves.toBeInstanceOf(CategoryService);
      expect(authenticate).not.toHaveBeenCalled();
    } finally {
      authenticate.mockRestore();
    }
  });
});
