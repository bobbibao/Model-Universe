import type { Model, ModelStatic, QueryInterface } from 'sequelize';

// Building blocks for idempotent migrations (docs/PROJECT_OVERVIEW.md, "Database changes"). Columns and tables are
// declared on their models first, so a fresh seed (`sync()`) already has them; migrations only add what an existing
// database lacks, and running one twice changes nothing.

// Creates the model's table when it is missing (CREATE TABLE IF NOT EXISTS, with its indexes and foreign keys).
export const ensureTables = async (...models: ModelStatic<Model>[]): Promise<void> => {
  for (const model of models) await model.sync();
};

// Adds the model's declared columns that the table does not have yet.
export const ensureColumns = async (
  queryInterface: QueryInterface,
  model: ModelStatic<Model>,
  columns: string[],
): Promise<void> => {
  const table = model.getTableName();
  const existing = await queryInterface.describeTable(table);
  const attributes = model.getAttributes();
  for (const column of columns) {
    if (!attributes[column]) throw new Error(`${model.name} declares no column ${column}`);
    if (!(column in existing)) await queryInterface.addColumn(table, column, attributes[column]);
  }
};
