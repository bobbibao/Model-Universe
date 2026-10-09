import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import Logger from '../../src/shared/server/utils/logger';

describe('database startup failure', () => {
  it('rejects startup when PostgreSQL is unavailable even outside strict seed mode', async () => {
    const previous = process.env.STRICT_SEED;
    delete process.env.STRICT_SEED;
    const unavailable = new Error('verification database is unavailable');
    const connection = DatabaseProvider.getInstance();
    const authenticate = jest.spyOn(connection, 'authenticate').mockRejectedValue(unavailable);
    const logging = jest.spyOn(Logger, 'ERROR').mockImplementation(() => {});
    try {
      await expect(DatabaseProvider.initialize()).rejects.toBe(unavailable);
    } finally {
      authenticate.mockRestore(); logging.mockRestore();
      if (previous === undefined) delete process.env.STRICT_SEED; else process.env.STRICT_SEED = previous;
      await connection.close();
    }
  });
});
