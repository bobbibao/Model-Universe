import { Model, ModelCtor } from 'sequelize-typescript';
import path from 'path';
import { faker } from '@faker-js/faker';
import Logger from '../../../../../shared/server/utils/logger';

async function getForeignKeyValue(model: ModelCtor<Model>, foreignKey: string): Promise<number | null> {
  try {
    const attribute = model.rawAttributes[foreignKey];
    if (attribute && typeof attribute.references === 'object' && 'model' in attribute.references) {
      const relatedModelNameOrClass = attribute.references.model;

      let relatedModel: ModelCtor<Model>;

      // Check if relatedModelNameOrClass is a string, then retrieve the model
      if (typeof relatedModelNameOrClass === 'string') {
        relatedModel = model.sequelize?.model(relatedModelNameOrClass) as ModelCtor<Model>;
      } else {
        // Handle the case where relatedModelNameOrClass is not a string (e.g., a Model class)
        relatedModel = relatedModelNameOrClass as ModelCtor<Model>;
      }

      if (!relatedModel) {
        Logger.INFO(`Related model for ${foreignKey} not found`);
        return null;
      }
      const relatedModelInstance = model.sequelize?.model(relatedModel.name) as ModelCtor<Model>;
      if (relatedModelInstance) {
        const relatedInstances = await relatedModelInstance?.findAll({
          attributes: ['id'],
          limit: 10,
        });
        if (relatedInstances.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * relatedInstances.length);
        return relatedInstances[randomIndex].id;
      }
    }
    return null;
  } catch (error) {
    Logger.ERROR(`Error fetching foreign key value for ${foreignKey}:`, error);
    return null;
  }
}

export const seedData = async (modelName: string): Promise<void> => {
  try {
    // Construct the file name from modelName (e.g., "ClientModel" -> "Client.Model.ts")

    const fileName = modelName.replace('Model', '.Model');
    const modelPath = path.join(__dirname, `../models/${fileName}.ts`);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const model = require(modelPath).default as ModelCtor<Model<any, any>>;
    await seedModel(model);

    Logger.INFO(`${modelName} seeding completed.`);
  } catch (error) {
    Logger.INFO(`Error seeding the ${modelName} table:`, error);
  }
};

async function generateFakeData(attribute: any): Promise<any> {
  switch (attribute.type.key) {
    case 'STRING':
    case 'TEXT':
      return faker.word.noun();
    case 'INTEGER':
      return faker.number.int({ min: 1, max: 10 });
    case 'DECIMAL':
      return faker.number.float({ min: 1, max: 10 });
    case 'BOOLEAN':
      return faker.datatype.boolean();
    case 'DATE':
      return faker.date.recent();
    case 'JSON':
      return JSON.stringify({ key: faker.word.noun() });
    default:
      return null;
  }
}

async function seedModel(model: ModelCtor<Model<any, any>>, count: number = 10): Promise<void> {
  const data = [];
  for (let i = 0; i < count; i++) {
    const instance: any = {};
    for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
      // Check if the attribute is a foreign key
      if (!attribute.primaryKey) {
        if (attribute.references) {
          instance[attributeName] = await getForeignKeyValue(model, attributeName);
        } else {
          instance[attributeName] = await generateFakeData(attribute);
        }
      }
    }
    data.push(instance);
  }

  try {
    await model.bulkCreate(data, { validate: true });
    Logger.INFO(`Seeded ${model.name}`);
  } catch (error) {
    Logger.ERROR(`Error seeding ${model.name}:`, error);
  }
}
