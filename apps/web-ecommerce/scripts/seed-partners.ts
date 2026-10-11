/* `yarn partners:seed`: add the synthetic marketplace sellers and their listings (seeders/Partner.Seeder.ts) to an
 * existing development or demo database without dropping anything.
 *
 * Applies the pending migrations first, then runs the real seller and moderation workflows for every demo seller
 * whose e-mail does not exist yet (sellerN@example.com). Needs the Model Universe catalog (`yarn catalog:import`) and an
 * admin account. A fresh `yarn seed-dev` / `yarn seed-ci` already includes the sellers.
 */
export {}; // a module: its names do not collide with the other scripts in the server build

process.env.SEED_DATA = 'false';
process.env.DROP_TABLES = 'false';
process.env.STRICT_SEED = 'true';

const database = process.env.DB_NAME || '';
if (!/_(test|demo)$/.test(database) && process.env.SEED_PROFILE !== 'development') {
  console.error(
    'partners:seed writes synthetic sellers: use a _test or _demo database, or set SEED_PROFILE=development.',
  );
  process.exit(1);
}

// Imported after the environment is set: the provider reads it when it initializes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseProvider = require('../src/core/server/database/Database.Provider').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { seedPartnerData } = require('../src/core/server/database/client/seeders/Partner.Seeder');

DatabaseProvider.initialize()
  .then(async () => {
    const { sellers, listings } = await seedPartnerData();
    await DatabaseProvider.getInstance().close();
    console.log(`partners seeded: ${sellers} sellers, ${listings} listings`);
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('partner seed failed:', error);
    process.exit(1);
  });
