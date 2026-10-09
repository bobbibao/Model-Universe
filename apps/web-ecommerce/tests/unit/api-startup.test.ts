import fs from 'fs';
import { initializeApiRoutes } from '../../apiRouter';
import Logger from '../../src/shared/server/utils/logger';

describe('API startup readiness', () => {
  it('rejects initialization when a discovered controller cannot load', async () => {
    const directory = jest.spyOn(fs, 'readdirSync').mockReturnValue(['missing.controller.ts'] as any);
    const logging = jest.spyOn(Logger, 'INFO').mockImplementation(() => {});
    try {
      await expect(initializeApiRoutes()).rejects.toThrow('missing.controller.ts');
    } finally {
      directory.mockRestore();
      logging.mockRestore();
    }
  });

  it('does not import the base controller or unrelated directory entries', async () => {
    const directory = jest.spyOn(fs, 'readdirSync').mockReturnValue(['ApiBase.controller.ts', 'README.md'] as any);
    try {
      await expect(initializeApiRoutes()).resolves.toBeUndefined();
    } finally {
      directory.mockRestore();
    }
  });
});
