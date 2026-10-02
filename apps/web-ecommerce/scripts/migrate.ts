/* `yarn db:migrate`: apply the pending migrations (src/core/server/database/migrations), recreate the analytics
 * views, and exit.
 *
 * The server does the same on every start; this does it without starting the server (for example before a deploy),
 * and exits non-zero on any error. It seeds nothing and drops nothing: the tables themselves come from a seed run
 * (`yarn seed-dev`, `yarn seed-ci`), and the migrations add what older databases lack.
 */
export {}; // a module: its names do not collide with scripts/seed.ts in the server build

process.env.SEED_DATA = 'false';
process.env.DROP_TABLES = 'false';
process.env.STRICT_SEED = 'true';

// Imported after the environment is set: the provider reads it when it initializes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseProvider = require('../src/core/server/database/Database.Provider').default;

DatabaseProvider.initialize()
  .then(async () => {
    await DatabaseProvider.getInstance().close();
    console.log('migrations applied');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('migration failed:', error);
    process.exit(1);
  });
