import type { Config } from 'jest';

// Two projects: `unit` (no database, `yarn test`) and `db` (a real Postgres named by TEST_DB_*, `yarn test:db`).
const shared = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    // The server code uses decorators with emitted metadata, like `tsconfig.server.json`.
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'es2021',
          esModuleInterop: true,
          resolveJsonModule: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          isolatedModules: false,
          jsx: 'react-jsx',
        },
      },
    ],
  },
};

const config: Config = {
  projects: [
    { ...shared, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
    { ...shared, displayName: 'db', testMatch: ['<rootDir>/tests/db/**/*.test.ts'] },
  ],
};

export default config;
