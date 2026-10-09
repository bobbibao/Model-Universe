import { assertSessionConfiguration } from '../../src/shared/server/utils/StartupValidation';

describe('effective production session configuration', () => {
  it('rejects a missing or weak production session secret', () => {
    for (const JWT_SECRET of [undefined, '', 'short-preview-only'])
      expect(() => assertSessionConfiguration({ NODE_ENV: 'production', JWT_SECRET })).toThrow('at least 32 bytes');
  });
  it('accepts an explicitly configured 32-byte production secret', () => {
    expect(() => assertSessionConfiguration({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) })).not.toThrow();
  });
  it('retains development configuration behavior', () => {
    expect(() => assertSessionConfiguration({ NODE_ENV: 'development' })).not.toThrow();
  });
});
