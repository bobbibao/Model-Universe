import Logger from '../../../../../shared/server/utils/logger';
import { failIfStrict } from './Seeder';
import SupplierModel from '../models/Supplier.Model';

const SUPPLIERS = [
  { name: 'Orbit Hobby Distribution (demo)', contactEmail: 'supply@orbit-hobby.example', website: 'https://orbit-hobby.example' },
  { name: 'Collector Exchange (demo)', contactEmail: 'intake@collector-exchange.example', website: 'https://collector-exchange.example' },
  { name: 'Build Lab Supplies (demo)', contactEmail: 'hello@build-lab.example', website: 'https://build-lab.example' },
];

export const seedSupplierData = async (): Promise<void> => {
  try {
    await SupplierModel.bulkCreate(SUPPLIERS);
    Logger.INFO(`${SUPPLIERS.length} suppliers seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the supplier table:', error);
    failIfStrict(error);
  }
};
