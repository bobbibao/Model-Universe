/* `yarn catalog:import`: add the Model Universe mecha catalog (seeders/data/model-universe-catalog.json, tracked in
 * docs/model_universe_seed.md) to an existing database without dropping anything.
 *
 * Applies the pending migrations first (like `yarn db:migrate`), then creates a product, its gallery image and its
 * provenance row for every catalog row not imported yet, in one transaction. Rows already imported are skipped, so
 * staff edits survive a re-run. A fresh `yarn seed-dev` / `yarn seed-ci` already includes the catalog.
 */
export {}; // a module: its names do not collide with the other scripts in the server build

process.env.SEED_DATA = 'false';
process.env.DROP_TABLES = 'false';
process.env.STRICT_SEED = 'true';

// Imported after the environment is set: the provider reads it when it initializes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseProvider = require('../src/core/server/database/Database.Provider').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { importModelUniverseCatalog } = require('../src/core/server/database/client/seeders/ModelUniverseCatalog');

DatabaseProvider.initialize()
  .then(async () => {
    const { created, skipped } = await importModelUniverseCatalog();
    await DatabaseProvider.getInstance().close();
    console.log(`catalog imported: ${created} created, ${skipped} already present`);
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('catalog import failed:', error);
    process.exit(1);
  });
