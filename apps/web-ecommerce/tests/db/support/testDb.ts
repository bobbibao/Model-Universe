// Points the web's database settings at the test database (TEST_DB_*). The tests drop and recreate tables, so the
// database must be a throwaway one: its name has to end in `_test`.
export const useTestDatabase = (): void => {
  const name = process.env.TEST_DB_NAME;
  if (!name?.endsWith('_test')) {
    throw new Error('Set TEST_DB_NAME (and TEST_DB_HOST/PORT/USERNAME/PASSWORD) to a throwaway database named *_test');
  }
  process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
  process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
  process.env.DB_USERNAME = process.env.TEST_DB_USERNAME || 'postgres';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
  process.env.DB_NAME = name;
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
};
