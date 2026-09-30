/* `yarn seed-ci`: drop, recreate and seed the shop tables, create the analytics views, then exit.
 *
 * Unlike `yarn seed-dev` (which seeds while starting the server) this runs to completion and exits non-zero on any
 * error: seeders rethrow with STRICT_SEED=true. The seed profile is explicit (SEED_PROFILE=development), not tied to
 * NODE_ENV, so the production-built web image can seed the e2e database.
 */
process.env.SEED_DATA = 'true';
process.env.DROP_TABLES = 'true';
process.env.SEED_PROFILE = process.env.SEED_PROFILE || 'development';
process.env.STRICT_SEED = process.env.STRICT_SEED || 'true';

// Imported after the environment is set: the provider reads it when it initializes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseProvider = require('../src/core/server/database/Database.Provider').default;

DatabaseProvider.initialize()
  .then(async () => {
    await DatabaseProvider.getInstance().close();
    console.log('seed completed');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('seed failed:', error);
    process.exit(1);
  });
