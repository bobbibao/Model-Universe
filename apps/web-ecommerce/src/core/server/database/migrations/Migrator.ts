import { SequelizeStorage, Umzug } from 'umzug';
import type { Sequelize } from 'sequelize-typescript';
import Logger from '../../../../shared/server/utils/logger';
import { MIGRATIONS, MigrationContext } from './index';

export const MIGRATION_TABLE = 'SequelizeMeta';

export const migrator = (sequelize: Sequelize) =>
  new Umzug<MigrationContext>({
    migrations: MIGRATIONS,
    context: { sequelize },
    storage: new SequelizeStorage({ sequelize, tableName: MIGRATION_TABLE }),
    logger: undefined,
  });

// Applies the pending migrations; returns their names. Runs on every server start, after the models are loaded
// (a seed has created the tables) and before the analytics views, which read the new columns.
export const runMigrations = async (sequelize: Sequelize): Promise<string[]> => {
  const applied = await migrator(sequelize).up();
  const names = applied.map((migration) => migration.name);
  if (names.length > 0) Logger.INFO(`Migrations applied: ${names.join(', ')}.`);
  return names;
};
