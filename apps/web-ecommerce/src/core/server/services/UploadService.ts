import Logger from '../../../shared/server/utils/logger';
import { Model, FindOptions, UpdateOptions, DestroyOptions, Op, ModelStatic } from 'sequelize';

/**
 * Service to handle the upload of data to the database
 * @param T The model type to be used
 */
export default class UploadService<T extends Model> {
  private model: ModelStatic<T>;

  constructor(model: ModelStatic<T>) {
    this.model = model;
  }

  // Save all records from the given array to the database
  // TODO: Add transaction support to ensure all records are saved or none are saved
  async saveAllRecords(updateRecords: T[]): Promise<T[]> {
    const result: T[] = [];

    try {
      const currentRecords = await this.model.findAll();

      const existingIds = Array.from(new Set<string>(updateRecords ? updateRecords.map((p) => p.dataValues.id) : []));

      const newRecords = updateRecords.filter((u) => u.dataValues.id == 0 || !u.dataValues.id);
      const foundExistingRecordsToUpdate = updateRecords.filter((u) => u.dataValues.id > 0);
      const removedRecords = currentRecords.filter((u) => !existingIds.includes(u.dataValues.id));

      await this.handleNewRecords(newRecords, result);
      await this.handleExistingRecords(foundExistingRecordsToUpdate, currentRecords, result);
      await this.handleRemovedRecords(removedRecords);
    } catch (error) {
      throw new Error('Failed to save records due to data mismatch.');
    }
    return result;
  }

  private async handleNewRecords(newRecords: T[], result: T[]) {
    if (newRecords && newRecords.length > 0) {
      const bulkCreateResult = await this.model.bulkCreate(newRecords.map((record) => record.dataValues));
      if (bulkCreateResult) {
        result.push(...bulkCreateResult);
      }
    }
  }

  private async handleExistingRecords(foundExistingRecordsToUpdate: T[], currentRecords: T[], result: T[]) {
    if (foundExistingRecordsToUpdate && foundExistingRecordsToUpdate.length > 0) {
      for (const f of foundExistingRecordsToUpdate) {
        const existingRecords = currentRecords.find((record) => record.dataValues.id === f.dataValues.id);
        if (existingRecords && this.recordNeedsUpdate(existingRecords, f)) {
          const update = await this.updateRecords(f);
          result.push(update[1][0]);
        }
      }
    }
  }

  private recordNeedsUpdate(existingRecords: T, updateRecords: T) {
    if (!existingRecords) {
      return false;
    }
    return Object.keys(updateRecords.dataValues).some(
      (key) => existingRecords.dataValues[key] !== updateRecords.dataValues[key],
    );
  }

  private async updateRecords(updateRecords: T) {
    return await this.model.update(
      updateRecords.dataValues,
      {
        where: { id: updateRecords.dataValues.id },
        returning: true,
      } /*as UpdateOptions */,
    );
  }

  private async handleRemovedRecords(removedRecords: T[]) {
    if (removedRecords && removedRecords.length > 0) {
      await this.model.destroy({
        where: {
          id: {
            [Op.in]: removedRecords.map((item) => item.dataValues.id),
          },
        },
      } as DestroyOptions);
    }
  }

  async setRecordId(updateRecords: T[], uniqueAttribute: keyof T['dataValues']): Promise<T[]> {
    const result: T[] = [];
    const uniqueValues = updateRecords.map((record) => record.dataValues[uniqueAttribute]);
    const existingRecords = await this.model.findAll({
      where: {
        [uniqueAttribute]: uniqueValues,
      },
    } as FindOptions);

    const existingRecordsMap = new Map(
      existingRecords.map((records) => [records.dataValues[uniqueAttribute].toString(), records]),
    );

    for (const record of updateRecords) {
      const uniqueValue = record.dataValues[uniqueAttribute].toString();
      const existingRecords = existingRecordsMap.get(uniqueValue);
      if (existingRecords) {
        record.dataValues.id = existingRecords.dataValues.id;
      }
      result.push(record);
    }
    return result;
  }
}
